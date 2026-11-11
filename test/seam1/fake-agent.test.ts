import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { AgentEvent } from '../../src/shared/agent'
import { createHost } from '../../src/main/host'
import { createFakeAgentProvider } from '../../src/main/agent/fake'
import type { AgentSession } from '../../src/main/agent/provider'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'margen-project-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** Reads a Session's events up to and including the next turn-end. */
async function untilTurnEnd(session: AgentSession, onEvent?: (e: AgentEvent) => void): Promise<AgentEvent[]> {
  const seen: AgentEvent[] = []
  for await (const event of session.events) {
    seen.push(event)
    onEvent?.(event)
    if (event.type === 'turn-end') break
  }
  return seen
}

const input = { text: 'Make the heading bigger', annotations: [] }

describe('the fake AgentProvider', () => {
  test('reports the scripted detection through the host API', async () => {
    const host = createHost({
      dataDir: dir,
      agent: createFakeAgentProvider({ detect: { installed: true, version: '2.1.0', signedIn: false } }),
    })
    expect(await host.call('agent.detect')).toEqual({ installed: true, version: '2.1.0', signedIn: false })
  })

  test('a scripted Install and Sign in change what detection reports', async () => {
    const host = createHost({
      dataDir: dir,
      agent: createFakeAgentProvider({
        detect: { installed: false, signedIn: false },
        install: { result: 'done', version: '2.1.322' },
        signIn: { result: 'done', plan: 'pro' },
      }),
    })
    expect(await host.call('agent.install')).toEqual({ ok: true, status: { installed: true, version: '2.1.322', signedIn: false } })
    expect(await host.call('agent.signIn')).toEqual({
      ok: true,
      status: { installed: true, version: '2.1.322', signedIn: true, plan: 'pro' },
    })
    expect(await host.call('agent.detect')).toEqual({ installed: true, version: '2.1.322', signedIn: true, plan: 'pro' })
  })

  test('a scripted failing Install reports its message and changes nothing', async () => {
    const host = createHost({
      dataDir: dir,
      agent: createFakeAgentProvider({
        detect: { installed: false, signedIn: false },
        install: { result: 'failed', message: 'No network' },
      }),
    })
    expect(await host.call('agent.install')).toEqual({
      ok: false,
      status: { installed: false, signedIn: false },
      message: 'No network',
    })
  })

  test('plays back a scripted Turn, really writing its edits into the Project', async () => {
    const agent = createFakeAgentProvider({
      turns: [
        [
          { type: 'thinking' },
          { type: 'tool', tool: 'read', file: 'index.html' },
          { type: 'tool', tool: 'write', file: 'index.html', added: 1, removed: 0, content: '<h1>Bigger</h1>' },
          { type: 'text', text: 'Done.' },
        ],
      ],
    })
    const session = agent.startSession({ projectDir: dir })
    session.send(input)

    expect(await untilTurnEnd(session)).toEqual([
      { type: 'thinking' },
      { type: 'tool', tool: 'read', file: 'index.html' },
      { type: 'tool', tool: 'write', file: 'index.html', added: 1, removed: 0 },
      { type: 'text', text: 'Done.' },
      { type: 'turn-end', reason: 'done' },
    ])
    expect(await readFile(join(dir, 'index.html'), 'utf8')).toBe('<h1>Bigger</h1>')
    expect(agent.sent).toEqual([input])
  })

  test('pauses a Turn at an approval request until it is answered', async () => {
    const agent = createFakeAgentProvider({
      turns: [
        [
          { type: 'approval-request', id: 'a1', kind: 'shell', detail: 'npm install' },
          { type: 'text', text: 'Installed.' },
        ],
      ],
    })
    const session = agent.startSession({ projectDir: dir })
    session.send(input)

    const seen = await untilTurnEnd(session, (event) => {
      if (event.type === 'approval-request') {
        setTimeout(() => session.answerApproval(event.id, 'allow-once'), 20)
      }
    })

    expect(seen.map((e) => e.type)).toEqual(['approval-request', 'text', 'turn-end'])
    expect(agent.approvals).toEqual([{ id: 'a1', decision: 'allow-once' }])
  })

  test('interrupting a slow Turn ends it straight away', async () => {
    const agent = createFakeAgentProvider({
      turns: [[{ type: 'thinking' }, { type: 'wait', ms: 10_000 }, { type: 'text', text: 'Too late.' }]],
    })
    const session = agent.startSession({ projectDir: dir })
    session.send(input)

    const seen = await untilTurnEnd(session, (event) => {
      if (event.type === 'thinking') void session.interrupt()
    })

    expect(seen).toEqual([{ type: 'thinking' }, { type: 'turn-end', reason: 'interrupted' }])
  })
})
