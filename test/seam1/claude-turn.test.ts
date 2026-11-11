import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Options, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { AgentEvent } from '../../src/shared/agent'
import { createClaudeCodeProvider } from '../../src/main/agent/claude'
import type { ClaudeRun, ClaudeSystem } from '../../src/main/agent/claude/system'
import type { AgentSession } from '../../src/main/agent/provider'

// The Claude Code provider's Turns, against a pretend Mac whose Agent SDK
// `query()` plays back scripted SDK messages, shaped as the user's real
// `claude` sends them (see the notes in claude-agent-sdk.md). No test runs `claude`.

const CLAUDE = '/Users/me/.local/bin/claude'

/** One scripted Turn: yields SDK messages. `interrupted` resolves when Margen interrupts it. */
type SdkTurn = (turn: {
  options: Options
  interrupted: Promise<void>
  /** Asks Margen whether a tool may run, as `claude` does. */
  canUseTool: (tool: string, input: Record<string, unknown>, toolUseID: string) => Promise<unknown>
}) => AsyncGenerator<unknown>

interface Run {
  options: Options
  prompts: SDKUserMessage[]
  interrupts: number
  closed: boolean
}

let projectDir: string
/** The Project as `claude` reports it: symlinks resolved (`/private/var/…` on a Mac). */
let realProjectDir: string

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'margen-project-'))
  realProjectDir = await realpath(projectDir)
})

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true })
})

function pretendMac({ signedIn = true, turns = [] as SdkTurn[] } = {}) {
  const runs: Run[] = []
  const system: ClaudeSystem = {
    home: '/Users/me',
    shell: '/bin/zsh',
    async run(file, args) {
      const command = [file, ...args].join(' ')
      if (command === '/bin/zsh -ilc command -v claude') return { exitCode: 0, stdout: `${CLAUDE}\n`, stderr: '' }
      if (command === `${CLAUDE} --version`) return { exitCode: 0, stdout: '2.1.287 (Claude Code)\n', stderr: '' }
      if (command === `${CLAUDE} auth status`) {
        return { exitCode: signedIn ? 0 : 1, stdout: JSON.stringify({ loggedIn: signedIn, subscriptionType: 'max' }), stderr: '' }
      }
      return { exitCode: 127, stdout: '', stderr: 'not found' }
    },
    isExecutable: async (path) => path === CLAUDE,
    openTerminal: async () => {},
    sleep: async () => {},
    loginEnv: async () => ({ PATH: '/Users/me/.nvm/bin:/usr/bin:/bin', HOME: '/Users/me' }),
    query({ prompt, options }) {
      const run: Run = { options, prompts: [], interrupts: 0, closed: false }
      runs.push(run)
      let interrupt = () => {}
      const messages = (async function* () {
        yield { type: 'system', subtype: 'init', session_id: options.sessionId ?? options.resume, claude_code_version: '2.1.287' }
        for await (const message of prompt) {
          run.prompts.push(message)
          const interrupted = new Promise<void>((resolve) => (interrupt = resolve))
          const turn = turns.shift()
          if (!turn) throw new Error('No more scripted Turns')
          const canUseTool = async (tool: string, input: Record<string, unknown>, toolUseID: string) => {
            // Like the real `claude`, read-only shell commands run without asking, unless a PreToolUse hook says ask.
            if (tool === 'Bash' && READ_ONLY.test(String(input.command)) && !(await hookAsks(options, tool, input, toolUseID))) {
              return { behavior: 'allow', updatedInput: input }
            }
            return options.canUseTool?.(tool, input, { signal: new AbortController().signal, toolUseID, requestId: `req-${toolUseID}` })
          }
          yield* turn({ options, interrupted, canUseTool })
        }
      })()
      const claudeRun: ClaudeRun = {
        [Symbol.asyncIterator]: () => messages,
        interrupt: async () => {
          run.interrupts++
          interrupt()
        },
        close: () => {
          run.closed = true
        },
      }
      return claudeRun
    },
  }
  return { provider: createClaudeCodeProvider(system), runs }
}

const READ_ONLY = /^(ls|cat|pwd)\b/

/** Whether the PreToolUse hooks Margen passed ask about this tool call, as `claude` runs them. */
async function hookAsks(options: Options, tool: string, input: Record<string, unknown>, toolUseID: string): Promise<boolean> {
  for (const matcher of options.hooks?.PreToolUse ?? []) {
    if (matcher.matcher && !new RegExp(`^(${matcher.matcher})$`).test(tool)) continue
    for (const hook of matcher.hooks) {
      const output = await hook(
        { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: toolUseID, session_id: 's', transcript_path: '', cwd: options.cwd ?? '' },
        toolUseID,
        { signal: new AbortController().signal },
      )
      const specific = 'hookSpecificOutput' in output ? output.hookSpecificOutput : undefined
      if (specific?.hookEventName === 'PreToolUse' && specific.permissionDecision === 'ask') return true
    }
  }
  return false
}

// SDK messages, as the user's `claude` sends them.
const assistant = (...content: unknown[]) => ({ type: 'assistant', parent_tool_use_id: null, message: { id: 'msg_1', content } })
const toolUse = (id: string, name: string, input: Record<string, unknown>) => assistant({ type: 'tool_use', id, name, input })
const toolResult = (id: string, toolUseResult: unknown, isError = false) => ({
  type: 'user',
  parent_tool_use_id: null,
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: 'ok' }] },
  tool_use_result: toolUseResult,
})
const stream = (event: unknown) => ({ type: 'stream_event', parent_tool_use_id: null, event })
const success = { type: 'result', subtype: 'success', is_error: false, result: 'Done.' }

/** Reads a Session's events up to and including the next turn-end, calling `onEvent` on each. */
async function untilTurnEnd(session: AgentSession, onEvent?: (event: AgentEvent) => void): Promise<AgentEvent[]> {
  const seen: AgentEvent[] = []
  for await (const event of session.events) {
    seen.push(event)
    onEvent?.(event)
    if (event.type === 'turn-end') break
  }
  return seen
}

const ask = { text: 'Make the heading bigger', annotations: [] }

describe('a Turn with Claude Code', () => {
  test("streams thinking, the file reads and edits with lines added and removed, and the reply", async () => {
    const file = join(realProjectDir, 'index.html')
    const { provider } = pretendMac({
      turns: [
        async function* () {
          yield stream({ type: 'message_start', message: { id: 'msg_1' } })
          yield stream({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } })
          yield stream({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'The h1 is ' } })
          yield stream({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'small.' } })
          // The finished block repeats what was streamed.
          yield assistant({ type: 'thinking', thinking: 'The h1 is small.' })
          yield { type: 'system', subtype: 'thinking_tokens', tokens: 12 }
          yield toolUse('toolu_1', 'Read', { file_path: file })
          yield toolResult('toolu_1', { type: 'text', file: { filePath: file, content: '<h1>Hi</h1>', numLines: 1 } })
          yield toolUse('toolu_2', 'Edit', { file_path: file, old_string: '<h1>', new_string: '<h1 class="big">' })
          yield toolResult('toolu_2', {
            filePath: file,
            structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-<h1>Hi</h1>', '+<h1 class="big">', '+Hi</h1>'] }],
          })
          yield { type: 'some_future_message', anything: true }
          yield stream({ type: 'message_start', message: { id: 'msg_2' } })
          yield stream({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done. ' } })
          yield stream({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'It is bigger.' } })
          yield { type: 'assistant', parent_tool_use_id: null, message: { id: 'msg_2', content: [{ type: 'text', text: 'Done. It is bigger.' }] } }
          yield success
        },
      ],
    })
    const session = provider.startSession({ projectDir })
    session.send(ask)

    expect(await untilTurnEnd(session)).toEqual([
      { type: 'thinking', text: 'The h1 is ' },
      { type: 'thinking', text: 'small.' },
      { type: 'tool', id: 'toolu_1', status: 'running', tool: 'read', file: 'index.html' },
      { type: 'tool', id: 'toolu_1', status: 'done', tool: 'read', file: 'index.html' },
      { type: 'tool', id: 'toolu_2', status: 'running', tool: 'edit', file: 'index.html' },
      { type: 'tool', id: 'toolu_2', status: 'done', tool: 'edit', file: 'index.html', added: 2, removed: 1 },
      { type: 'text', text: 'Done. ' },
      { type: 'text', text: 'It is bigger.' },
      { type: 'turn-end', reason: 'done' },
    ])
  })

  test("without streamed pieces, the finished blocks are the thinking and the reply", async () => {
    const { provider } = pretendMac({
      turns: [
        async function* () {
          yield assistant({ type: 'thinking', thinking: 'Hmm.' })
          yield assistant({ type: 'text', text: 'Here you go.' })
          yield success
        },
      ],
    })
    const session = provider.startSession({ projectDir })
    session.send(ask)

    expect(await untilTurnEnd(session)).toEqual([
      { type: 'thinking', text: 'Hmm.' },
      { type: 'text', text: 'Here you go.' },
      { type: 'turn-end', reason: 'done' },
    ])
  })

  test('a new file counts all its lines as added; files outside the Project keep their full path; other tools say what they ran', async () => {
    const { provider } = pretendMac({
      turns: [
        async function* () {
          const created = join(realProjectDir, 'pages', 'about.html')
          yield toolUse('w', 'Write', { file_path: created, content: '<h1>About</h1>\n<p>Us</p>\n' })
          yield toolResult('w', { type: 'create', filePath: created, content: '<h1>About</h1>\n<p>Us</p>\n', structuredPatch: [] })
          yield toolUse('r', 'Read', { file_path: '/etc/hosts' })
          yield toolResult('r', 'Error: User denied', true)
          yield toolUse('g', 'Grep', { pattern: 'h1' })
          yield toolResult('g', { mode: 'files_with_matches', filenames: [] })
          yield success
        },
      ],
    })
    const session = provider.startSession({ projectDir })
    session.send(ask)

    const tools = (await untilTurnEnd(session)).filter((event) => event.type === 'tool' && event.status !== 'running')
    expect(tools).toEqual([
      { type: 'tool', id: 'w', status: 'done', tool: 'write', file: 'pages/about.html', added: 2, removed: 0 },
      { type: 'tool', id: 'r', status: 'failed', tool: 'read', file: '/etc/hosts' },
      { type: 'tool', id: 'g', status: 'done', tool: 'search', name: 'Grep', detail: 'h1' },
    ])
  })

  test("runs the user's own claude in the Project, isolated from their Claude settings, with summarised thinking", async () => {
    const { provider, runs } = pretendMac({
      turns: [
        async function* () {
          yield success
        },
      ],
    })
    const session = provider.startSession({ projectDir, model: 'haiku', effort: 'low' })
    session.send(ask)
    await untilTurnEnd(session)

    expect(runs).toHaveLength(1)
    const { options, prompts } = runs[0] ?? { options: {}, prompts: [] }
    expect(options).toMatchObject({
      pathToClaudeCodeExecutable: CLAUDE,
      cwd: projectDir,
      settingSources: [],
      thinking: { type: 'adaptive', display: 'summarized' },
      includePartialMessages: true,
      model: 'haiku',
      effort: 'low',
      sessionId: session.id,
    })
    expect(options.env).toMatchObject({ PATH: '/Users/me/.nvm/bin:/usr/bin:/bin', HOME: '/Users/me' })
    expect(options.resume).toBeUndefined()
    expect(prompts).toEqual([{ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: ask.text } }])
  })

  test('the Turns of a Session go to one running claude, and a resumed Session continues the same one', async () => {
    const { provider, runs } = pretendMac({
      turns: [
        async function* () {
          yield success
        },
        async function* () {
          yield success
        },
        async function* () {
          yield success
        },
      ],
    })
    const session = provider.startSession({ projectDir })
    session.send(ask)
    await untilTurnEnd(session)
    session.send({ text: 'Now the colour', annotations: [] })
    await untilTurnEnd(session)
    expect(runs).toHaveLength(1)
    expect(runs[0]?.prompts).toHaveLength(2)
    session.close()
    expect(runs[0]?.closed).toBe(true)

    const resumed = provider.startSession({ projectDir, resumeId: session.id })
    resumed.send(ask)
    await untilTurnEnd(resumed)
    expect(resumed.id).toBe(session.id)
    expect(runs[1]?.options).toMatchObject({ resume: session.id })
    expect(runs[1]?.options.sessionId).toBeUndefined()
  })
})

describe('permissions', () => {
  test('edits inside the Project go ahead without asking', async () => {
    let decision: unknown
    const { provider } = pretendMac({
      turns: [
        async function* ({ canUseTool }) {
          const input = { file_path: join(realProjectDir, 'index.html'), content: '' }
          decision = await canUseTool('Write', input, 'w')
          yield success
        },
      ],
    })
    const session = provider.startSession({ projectDir })
    session.send(ask)
    const events = await untilTurnEnd(session)

    expect(decision).toEqual({ behavior: 'allow', updatedInput: { file_path: join(realProjectDir, 'index.html'), content: '' } })
    expect(events.map((event) => event.type)).toEqual(['turn-end'])
  })

  test('a shell command or a path outside the Project asks first, and the answer reaches claude', async () => {
    const decisions: unknown[] = []
    const { provider } = pretendMac({
      turns: [
        async function* ({ canUseTool }) {
          decisions.push(await canUseTool('Bash', { command: 'npm install' }, 'b'))
          decisions.push(await canUseTool('Write', { file_path: '/etc/hosts', content: '' }, 'o'))
          yield success
        },
      ],
    })
    const session = provider.startSession({ projectDir })
    session.send(ask)

    const events = await untilTurnEnd(session, (event) => {
      if (event.type === 'approval-request') session.answerApproval(event.id, event.kind === 'shell' ? 'allow-once' : 'deny')
    })

    expect(events.filter((event) => event.type === 'approval-request')).toEqual([
      { type: 'approval-request', id: 'b', kind: 'shell', detail: 'npm install' },
      { type: 'approval-request', id: 'o', kind: 'outside-project', detail: 'Write /etc/hosts' },
    ])
    expect(decisions).toEqual([
      { behavior: 'allow', updatedInput: { command: 'npm install' } },
      { behavior: 'deny', message: 'The user denied this.' },
    ])
  })

  test("a read-only shell command asks too, though claude would run it without asking", async () => {
    let decision: unknown
    const { provider } = pretendMac({
      turns: [
        async function* ({ canUseTool }) {
          decision = await canUseTool('Bash', { command: 'ls -la' }, 'b')
          yield success
        },
      ],
    })
    const session = provider.startSession({ projectDir })
    session.send(ask)

    const events = await untilTurnEnd(session, (event) => {
      if (event.type === 'approval-request') session.answerApproval(event.id, 'deny')
    })

    expect(events.filter((event) => event.type === 'approval-request')).toEqual([
      { type: 'approval-request', id: 'b', kind: 'shell', detail: 'ls -la' },
    ])
    expect(decision).toEqual({ behavior: 'deny', message: 'The user denied this.' })
  })

  test('web search and fetch go ahead; a tool Margen does not know asks by name', async () => {
    const decisions: unknown[] = []
    const { provider } = pretendMac({
      turns: [
        async function* ({ canUseTool }) {
          decisions.push(await canUseTool('WebFetch', { url: 'https://example.com', prompt: 'x' }, 'f'))
          decisions.push(await canUseTool('WebSearch', { query: 'bread photo' }, 's'))
          decisions.push(await canUseTool('mcp__figma__export', {}, 'm'))
          yield success
        },
      ],
    })
    const session = provider.startSession({ projectDir })
    session.send(ask)

    const events = await untilTurnEnd(session, (event) => {
      if (event.type === 'approval-request') session.answerApproval(event.id, 'allow-once')
    })

    expect(events.filter((event) => event.type === 'approval-request')).toEqual([
      { type: 'approval-request', id: 'm', kind: 'other', detail: 'mcp__figma__export' },
    ])
    expect(decisions.map((decision) => (decision as { behavior: string }).behavior)).toEqual(['allow', 'allow', 'allow'])
  })

  test('the permission policy passed in decides', async () => {
    let decision: unknown
    const { provider } = pretendMac({
      turns: [
        async function* ({ canUseTool }) {
          decision = await canUseTool('Bash', { command: 'ls' }, 'b')
          yield success
        },
      ],
    })
    const session = provider.startSession({ projectDir, permissions: async () => 'allow' })
    session.send(ask)
    await untilTurnEnd(session)

    expect(decision).toEqual({ behavior: 'allow', updatedInput: { command: 'ls' } })
  })
})

describe('interrupting and failing', () => {
  test('interrupt stops the running Turn in claude and ends it as interrupted', async () => {
    const { provider, runs } = pretendMac({
      turns: [
        async function* ({ interrupted }) {
          yield assistant({ type: 'text', text: 'Working on it' })
          await interrupted
          yield { type: 'result', subtype: 'error_during_execution', is_error: true, errors: [], stop_reason: null }
        },
      ],
    })
    const session = provider.startSession({ projectDir })
    session.send(ask)

    const events = await untilTurnEnd(session, (event) => {
      if (event.type === 'text') void session.interrupt()
    })

    expect(events).toEqual([
      { type: 'text', text: 'Working on it' },
      { type: 'turn-end', reason: 'interrupted' },
    ])
    expect(runs[0]?.interrupts).toBe(1)
  })

  test('Stop while an approval waits denies it, and the Turn ends as interrupted', async () => {
    let decision: unknown
    const { provider } = pretendMac({
      turns: [
        async function* ({ canUseTool, interrupted }) {
          decision = await canUseTool('Bash', { command: 'npm install' }, 'b')
          await interrupted
          yield { type: 'result', subtype: 'error_during_execution', is_error: true, errors: [], stop_reason: null }
        },
      ],
    })
    const session = provider.startSession({ projectDir })
    session.send(ask)

    const events = await untilTurnEnd(session, (event) => {
      if (event.type === 'approval-request') void session.interrupt()
    })

    expect(decision).toEqual({ behavior: 'deny', message: 'The user denied this.' })
    expect(events.map((event) => event.type)).toEqual(['approval-request', 'turn-end'])
    expect(events.at(-1)).toEqual({ type: 'turn-end', reason: 'interrupted' })
  })

  test('a signed-out claude says so before running anything', async () => {
    const { provider, runs } = pretendMac({ signedIn: false })
    const session = provider.startSession({ projectDir })
    session.send(ask)

    expect(await untilTurnEnd(session)).toEqual([
      { type: 'error', message: 'Claude Code is signed out. Sign in again to continue.', reason: 'signed-out' },
      { type: 'turn-end', reason: 'failed' },
    ])
    expect(runs).toHaveLength(0)
  })

  test('a login that expires mid-Session asks to sign in again', async () => {
    const { provider } = pretendMac({
      turns: [
        async function* () {
          yield {
            type: 'assistant',
            parent_tool_use_id: null,
            error: 'authentication_failed',
            message: { id: 'x', content: [{ type: 'text', text: 'Invalid API key · Please run /login' }] },
          }
          yield { type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key · Please run /login' }
        },
      ],
    })
    const session = provider.startSession({ projectDir })
    session.send(ask)

    expect(await untilTurnEnd(session)).toEqual([
      { type: 'error', message: 'Your Claude Code login has expired. Sign in again to continue.', reason: 'signed-out' },
      { type: 'turn-end', reason: 'failed' },
    ])
  })

  test("a failed Turn says what went wrong", async () => {
    const { provider } = pretendMac({
      turns: [
        async function* () {
          yield { type: 'result', subtype: 'error_max_turns', is_error: true, errors: ['Reached the maximum number of turns'] }
        },
      ],
    })
    const session = provider.startSession({ projectDir })
    session.send(ask)

    expect(await untilTurnEnd(session)).toEqual([
      { type: 'error', message: 'Reached the maximum number of turns' },
      { type: 'turn-end', reason: 'failed' },
    ])
  })

  test('when claude crashes the Turn fails, and the next Turn starts it again on the same session', async () => {
    const { provider, runs } = pretendMac({
      turns: [
        // eslint-disable-next-line require-yield
        async function* () {
          throw new Error('Claude Code process exited with code 1')
        },
        async function* () {
          yield success
        },
      ],
    })
    const session = provider.startSession({ projectDir })
    session.send(ask)
    expect(await untilTurnEnd(session)).toEqual([
      { type: 'error', message: 'Claude Code process exited with code 1' },
      { type: 'turn-end', reason: 'failed' },
    ])

    session.send(ask)
    expect(await untilTurnEnd(session)).toEqual([{ type: 'turn-end', reason: 'done' }])
    expect(runs).toHaveLength(2)
    expect(runs[1]?.options).toMatchObject({ resume: session.id })
  })
})

describe('model and effort', () => {
  const done = async function* () {
    yield success
  }

  test("a Turn's model and effort reach claude; without them claude uses its own default", async () => {
    const { provider, runs } = pretendMac({ turns: [done] })
    const session = provider.startSession({ projectDir })
    session.send({ ...ask, model: 'opus', effort: 'high' })
    await untilTurnEnd(session)

    expect(runs[0]?.options).toMatchObject({ model: 'opus', effort: 'high' })

    const { provider: other, runs: otherRuns } = pretendMac({ turns: [done] })
    const plain = other.startSession({ projectDir })
    plain.send(ask)
    await untilTurnEnd(plain)
    expect(otherRuns[0]?.options).not.toHaveProperty('model')
    expect(otherRuns[0]?.options).not.toHaveProperty('effort')
  })

  test('changing the model or effort between Turns restarts claude on the same session; keeping them does not', async () => {
    const { provider, runs } = pretendMac({ turns: [done, done, done, done] })
    const session = provider.startSession({ projectDir })

    for (const turn of [
      { ...ask, model: 'sonnet' },
      { ...ask, model: 'sonnet' },
      { ...ask, model: 'haiku', effort: 'low' as const },
      ask,
    ]) {
      session.send(turn)
      expect(await untilTurnEnd(session)).toEqual([{ type: 'turn-end', reason: 'done' }])
    }

    expect(runs.map((run) => [run.options.model, run.options.effort, run.prompts.length])).toEqual([
      ['sonnet', undefined, 2],
      ['haiku', 'low', 1],
      [undefined, undefined, 1],
    ])
    expect(runs.map((run) => run.closed)).toEqual([true, true, false])
    expect(runs[1]?.options).toMatchObject({ resume: session.id })
    expect(runs[2]?.options).toMatchObject({ resume: session.id })
  })

  test('after a restart for another model, shell commands still ask and the policy passed in still decides', async () => {
    const asked: string[] = []
    const lsAsks = async function* ({ canUseTool }: Parameters<SdkTurn>[0]) {
      await canUseTool('Bash', { command: 'ls' }, 'b')
      await canUseTool('Write', { file_path: join(realProjectDir, 'index.html'), content: '' }, 'w')
      yield success
    }
    const { provider, runs } = pretendMac({ turns: [lsAsks, lsAsks] })
    const session = provider.startSession({
      projectDir,
      permissions: async (request) => {
        asked.push(request.kind)
        return request.kind === 'shell' ? 'ask' : 'allow'
      },
    })

    for (const turn of [{ ...ask, model: 'sonnet' }, { ...ask, model: 'haiku' }]) {
      session.send(turn)
      const events = await untilTurnEnd(session, (event) => {
        if (event.type === 'approval-request') session.answerApproval(event.id, 'allow-once')
      })
      expect(events.map((event) => event.type)).toEqual(['approval-request', 'turn-end'])
    }

    expect(runs).toHaveLength(2)
    expect(asked).toEqual(['shell', 'write', 'shell', 'write'])
  })

  test('a Turn interrupted before claude has started ends as interrupted without running', async () => {
    const { provider, runs } = pretendMac({ turns: [done] })
    const session = provider.startSession({ projectDir })
    session.send(ask)
    void session.interrupt()

    expect(await untilTurnEnd(session)).toEqual([{ type: 'turn-end', reason: 'interrupted' }])
    expect(runs.flatMap((run) => run.prompts)).toEqual([])
  })
})
