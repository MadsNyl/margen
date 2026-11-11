import { randomUUID } from 'node:crypto'
import type { CanUseTool, Options, PermissionResult, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AgentEvent, AgentStatus, ApprovalDecision, TurnInput } from '@shared/agent'
import { projectPolicy, type ToolRequest } from '../../permissions'
import { createChannel } from '../channel'
import type { AgentSession, StartSessionOptions } from '../provider'
import { createMessageMapper } from './messages'
import type { ClaudeRun, ClaudeSystem } from './system'

// One Claude Code session: a long-lived `query()` fed one user message per
// Turn (streaming input), started on the first Turn. If `claude` exits, the
// next Turn starts it again, resuming the same session.

const SIGNED_OUT = 'Claude Code is signed out. Sign in again to continue.'
const NOT_INSTALLED = "Claude Code isn't installed. Set it up from the Start screen."
const STDERR_LINES = 20

type Effort = NonNullable<Options['effort']>

export function startClaudeSession(
  system: ClaudeSystem,
  detect: () => Promise<AgentStatus>,
  { projectDir, model, effort, resumeId, permissions = projectPolicy(projectDir) }: StartSessionOptions,
): AgentSession {
  const id = resumeId ?? randomUUID()
  const events = createChannel<AgentEvent>()
  const approvals = new Map<string, (decision: ApprovalDecision) => void>()
  let run: { claude: ClaudeRun; input: ReturnType<typeof createChannel<SDKUserMessage>> } | undefined
  /** Whether `claude` already knows this session, so a restart resumes it. */
  let known = resumeId !== undefined
  let running = false
  let interrupting = false
  let closed = false
  let turns = Promise.resolve()

  function emit(event: AgentEvent) {
    if (event.type === 'turn-end') {
      running = false
      interrupting = false
    }
    events.push(event)
  }

  function fail(message: string, reason?: 'signed-out' | 'not-installed') {
    emit({ type: 'error', message, ...(reason && { reason }) })
    emit({ type: 'turn-end', reason: 'failed' })
  }

  const canUseTool: CanUseTool = async (toolName, input, { signal, toolUseID }): Promise<PermissionResult> => {
    const request = toolRequest(toolName, input, projectDir)
    const allow: PermissionResult = { behavior: 'allow', updatedInput: input }
    if ((await permissions(request)) === 'allow') return allow
    const approvalId = toolUseID || randomUUID()
    const decision = new Promise<ApprovalDecision>((resolve) => {
      approvals.set(approvalId, resolve)
      signal.addEventListener('abort', () => resolve('deny'), { once: true })
    })
    events.push({
      type: 'approval-request',
      id: approvalId,
      kind: request.kind === 'shell' ? 'shell' : 'outside-project',
      detail: describe(toolName, request),
    })
    const answer = await decision
    approvals.delete(approvalId)
    return answer === 'allow-once' ? allow : { behavior: 'deny', message: 'The user denied this.' }
  }

  function start(claudePath: string, env: Record<string, string>) {
    const input = createChannel<SDKUserMessage>()
    const mapper = createMessageMapper(projectDir)
    const stderr: string[] = []
    const claude = system.query({
      prompt: input.iterable,
      options: {
        // Always the user's own `claude`, never the SDK's bundled one (ADR 0002).
        pathToClaudeCodeExecutable: claudePath,
        cwd: projectDir,
        env: { ...env, CLAUDE_AGENT_SDK_CLIENT_APP: 'margen' },
        // The user's settings files stay out: their allow rules would approve tools behind Margen's back.
        settingSources: [],
        // Without `summarized` the thinking arrives empty.
        thinking: { type: 'adaptive', display: 'summarized' },
        includePartialMessages: true,
        canUseTool,
        ...(model && { model }),
        ...(effort && { effort: effort as Effort }),
        ...(known ? { resume: id } : { sessionId: id }),
        stderr: (text) => {
          stderr.push(...text.split('\n').filter((line) => line.trim()))
          stderr.splice(0, Math.max(0, stderr.length - STDERR_LINES))
        },
      },
    })
    const current = { claude, input }
    run = current

    void (async () => {
      let failure: string | undefined
      try {
        for await (const message of claude) {
          known = true
          for (const event of mapper.map(message, { interrupting })) emit(event)
        }
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error)
      }
      if (run === current) run = undefined
      input.close()
      if (closed || !running) return
      const detail = stderr.at(-1)
      const message = failure ?? 'Claude Code stopped unexpectedly.'
      fail(detail && !message.includes(detail) ? `${message}: ${detail}` : message)
    })()
    return current
  }

  async function turn(input: TurnInput) {
    if (closed) return
    running = true
    if (!run) {
      const status = await detect()
      if (!status.path) return fail(NOT_INSTALLED, 'not-installed')
      if (!status.signedIn) return fail(SIGNED_OUT, 'signed-out')
      if (closed) return
      start(status.path, await system.loginEnv())
    }
    // Ticket 12 builds the prompt from the Annotations too (src/main/turns/).
    run?.input.push({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: input.text } })
  }

  function denyAll() {
    for (const resolve of approvals.values()) resolve('deny')
    approvals.clear()
  }

  return {
    id,
    events: events.iterable,
    send(input) {
      turns = turns.then(() => turn(input))
    },
    async interrupt() {
      if (!running || !run) return
      interrupting = true
      denyAll()
      await run.claude.interrupt()
    },
    answerApproval(approvalId, decision) {
      approvals.get(approvalId)?.(decision)
    },
    close() {
      closed = true
      denyAll()
      run?.claude.close()
      run?.input.close()
      run = undefined
      events.close()
    },
  }
}

/** A Claude Code tool call, as the permission policy sees it. */
function toolRequest(toolName: string, input: Record<string, unknown>, projectDir: string): ToolRequest {
  const path = [input.file_path, input.notebook_path, input.path].find((p): p is string => typeof p === 'string') ?? projectDir
  switch (toolName) {
    case 'Read':
    case 'Glob':
    case 'Grep':
    case 'LS':
      return { kind: 'read', path }
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { kind: 'write', path }
    case 'Bash':
      return { kind: 'shell', command: typeof input.command === 'string' ? input.command : '' }
    case 'WebFetch':
    case 'WebSearch':
      return { kind: 'web' }
    default:
      return { kind: 'other', name: toolName }
  }
}

function describe(toolName: string, request: ToolRequest): string {
  switch (request.kind) {
    case 'shell':
      return request.command
    case 'read':
    case 'write':
      return `${toolName} ${request.path}`
    default:
      return toolName
  }
}
