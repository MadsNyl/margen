import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AgentEvent, AgentSetupResult, AgentStatus, ApprovalDecision, ToolEvent, TurnInput } from '@shared/agent'
import { approvalRequest, editorPolicy, type ToolRequest } from '../permissions'
import { createChannel } from './channel'
import type { AgentProvider, AgentSession, StartSessionOptions } from './provider'

// A stand-in Agent for Seam 1 and Seam 2 tests. Each `send` plays back the
// next scripted Turn; a turn-end is added when the script doesn't end with one.
// An approval-request pauses the Turn until it's answered, `wait` makes a slow
// Turn, and `interrupt` ends the running Turn with turn-end "interrupted".
// Install and Sign in play back their scripted outcome (done by default) after
// `ms`; a done one updates what `detect` reports from then on. A Turn with an
// error step ends with turn-end "failed". A `permission` step asks the Session's
// policy about a tool request, as a real Agent does; only an "ask" becomes an
// approval-request (and pauses the Turn).

export type FakeStep =
  | Exclude<AgentEvent, ToolEvent>
  /** With `content`, an edit or write really writes the file (relative to the Project) before the event is emitted. */
  | (ToolEvent & { content?: string })
  | { type: 'wait'; ms: number }
  /** A tool call that goes through the permission policy first; `id` becomes the approval-request's. */
  | { type: 'permission'; id: string; request: ToolRequest }

export interface FakeSetupStep {
  result: 'done' | 'failed'
  /** How long the step takes. */
  ms?: number
  /** For failed: what went wrong. */
  message?: string
}

export interface FakeAgentScript {
  detect?: AgentStatus
  install?: FakeSetupStep & { version?: string }
  signIn?: FakeSetupStep & { plan?: string }
  turns?: FakeStep[][]
}

export interface FakeAgentProvider extends AgentProvider {
  /** Every TurnInput sent to any of its Sessions, in order. */
  sent: TurnInput[]
  /** Every approval answer given to any of its Sessions, in order. */
  approvals: { id: string; decision: ApprovalDecision }[]
  /** The options of every Session started, in order. */
  sessions: StartSessionOptions[]
}

const fallbackTurn: FakeStep[] = [{ type: 'text', text: 'OK.' }]

export function createFakeAgentProvider(script: FakeAgentScript = {}): FakeAgentProvider {
  let status = script.detect ?? { installed: true, version: 'fake', signedIn: true }
  const turns = [...(script.turns ?? [])]
  const sent: TurnInput[] = []
  const approvals: FakeAgentProvider['approvals'] = []
  const sessions: StartSessionOptions[] = []

  function startSession(options: StartSessionOptions): AgentSession {
    const { projectDir, resumeId, permissions = editorPolicy(projectDir) } = options
    sessions.push(options)
    const id = resumeId ?? `fake-session-${sessions.length}`
    const channel = createChannel<AgentEvent>()
    const pendingApprovals = new Map<string, () => void>()
    let queue = Promise.resolve()
    let interruptCurrent: (() => void) | undefined

    async function play(steps: FakeStep[]) {
      let interrupted = false
      let failed = false
      const stopped = new Promise<void>((resolve) => {
        interruptCurrent = () => {
          interrupted = true
          resolve()
        }
      })
      const unlessInterrupted = (work: Promise<unknown>) => Promise.race([work, stopped])

      for (const step of steps) {
        if (interrupted) break
        if (step.type === 'wait') {
          let timer: NodeJS.Timeout | undefined
          await unlessInterrupted(new Promise((resolve) => (timer = setTimeout(resolve, step.ms))))
          clearTimeout(timer)
          continue
        }
        if (step.type === 'permission') {
          if ((await permissions(step.request)) === 'ask') {
            const request = approvalRequest(step.id, step.request)
            channel.push(request)
            await unlessInterrupted(new Promise<void>((resolve) => pendingApprovals.set(request.id, resolve)))
          }
          continue
        }
        if (step.type === 'tool') {
          const { content, ...event } = step
          if (content !== undefined && 'file' in step) {
            const path = join(projectDir, step.file)
            await mkdir(dirname(path), { recursive: true })
            await writeFile(path, content)
          }
          channel.push(event as ToolEvent)
          continue
        }
        channel.push(step)
        if (step.type === 'error') failed = true
        if (step.type === 'approval-request') {
          await unlessInterrupted(new Promise<void>((resolve) => pendingApprovals.set(step.id, resolve)))
        }
        if (step.type === 'turn-end') return
      }
      interruptCurrent = undefined
      channel.push({ type: 'turn-end', reason: interrupted ? 'interrupted' : failed ? 'failed' : 'done' })
    }

    return {
      id,
      events: channel.iterable,
      send(turn) {
        sent.push(turn)
        const steps = turns.shift() ?? fallbackTurn
        queue = queue.then(() => play(steps))
      },
      async interrupt() {
        interruptCurrent?.()
      },
      answerApproval(approvalId, decision) {
        approvals.push({ id: approvalId, decision })
        pendingApprovals.get(approvalId)?.()
        pendingApprovals.delete(approvalId)
      },
      close() {
        interruptCurrent?.()
        channel.close()
      },
    }
  }

  async function setup(step: FakeSetupStep | undefined, change: Partial<AgentStatus>): Promise<AgentSetupResult> {
    if (step?.ms) await new Promise((resolve) => setTimeout(resolve, step.ms))
    if (step?.result === 'failed') return { ok: false, status, message: step.message ?? 'Failed' }
    status = { ...status, ...change }
    return { ok: true, status }
  }

  return {
    sent,
    approvals,
    sessions,
    detect: async () => status,
    install: () => setup(script.install, { installed: true, version: script.install?.version ?? status.version ?? 'fake' }),
    signIn: () =>
      setup(script.signIn, { signedIn: true, ...(script.signIn?.plan !== undefined && { plan: script.signIn.plan }) }),
    startSession,
  }
}
