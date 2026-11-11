import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { HostEvents } from '../../src/shared/host-api'
import { createHost, type Host } from '../../src/main/host'
import { createFakeAgentProvider, type FakeAgentProvider, type FakeAgentScript } from '../../src/main/agent/fake'

let dataDir: string
let projectDir: string
let host: Host
let agent: FakeAgentProvider

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'margen-data-'))
  projectDir = await mkdtemp(join(tmpdir(), 'margen-project-'))
})

afterEach(async () => {
  host?.dispose()
  await rm(dataDir, { recursive: true, force: true })
  await rm(projectDir, { recursive: true, force: true })
})

async function editor(script: FakeAgentScript, files: Record<string, string> = { 'index.html': '<h1>Small</h1>' }) {
  for (const [path, content] of Object.entries(files)) await writeFile(join(projectDir, path), content)
  agent = createFakeAgentProvider(script)
  host = createHost({ dataDir, agent })
  await host.call('projects.open', projectDir)
  await host.call('document.open', 'index.html')
}

/** Collects `session.entry` events; `turnEnded` resolves at the next turn-end. */
function entries() {
  const seen: HostEvents['session.entry'][] = []
  let ended = () => {}
  host.on('session.entry', (payload) => {
    seen.push(payload)
    if (payload.entry.type === 'turn-end') ended()
  })
  return { seen, nextTurnEnd: () => new Promise<void>((resolve) => (ended = resolve)) }
}

const ask = { text: 'Make the heading bigger', annotations: [] }

describe('a Turn in the editor', () => {
  test("sending streams the user's message and the Agent's events, and the Agent's edit lands on disk", async () => {
    await editor({
      turns: [
        [
          { type: 'thinking' },
          { type: 'tool', id: 't1', tool: 'read', file: 'index.html' },
          { type: 'tool', id: 't2', tool: 'edit', file: 'index.html', added: 1, removed: 1, content: '<h1>Big</h1>' },
          { type: 'text', text: 'Done. ' },
          { type: 'text', text: 'The heading is bigger.' },
        ],
      ],
    })
    const { seen, nextTurnEnd } = entries()
    const ended = nextTurnEnd()

    await host.call('session.send', ask)
    await ended

    expect(seen.map(({ entry }) => entry)).toEqual([
      { type: 'user', turn: ask },
      { type: 'thinking' },
      { type: 'tool', id: 't1', tool: 'read', file: 'index.html' },
      { type: 'tool', id: 't2', tool: 'edit', file: 'index.html', added: 1, removed: 1 },
      { type: 'text', text: 'Done. ' },
      { type: 'text', text: 'The heading is bigger.' },
      { type: 'turn-end', reason: 'done' },
    ])
    expect(seen.map(({ document, index }) => [document, index])).toEqual(seen.map((_, i) => ['index.html', i]))
    expect(await readFile(join(projectDir, 'index.html'), 'utf8')).toBe('<h1>Big</h1>')
    expect(agent.sent).toEqual([ask])
    expect(await host.call('session.current')).toEqual({ document: 'index.html', entries: seen.map(({ entry }) => entry) })
  })

  test("the Agent's edit to the Document reloads it", async () => {
    await editor({ turns: [[{ type: 'tool', tool: 'write', file: 'index.html', added: 1, removed: 1, content: '<h1>New</h1>' }]] })
    const updated = new Promise<HostEvents['document.updated']>((resolve) => host.on('document.updated', resolve))

    await host.call('session.send', ask)

    expect(await updated).toEqual({ path: 'index.html' })
  })

  test('Turns in a row go to the same Agent session', async () => {
    await editor({ turns: [[{ type: 'text', text: 'One.' }], [{ type: 'text', text: 'Two.' }]] })
    const { seen, nextTurnEnd } = entries()

    let ended = nextTurnEnd()
    await host.call('session.send', ask)
    await ended
    ended = nextTurnEnd()
    await host.call('session.send', { text: 'And the colour', annotations: [] })
    await ended

    expect(seen.map(({ entry }) => entry.type)).toEqual(['user', 'text', 'turn-end', 'user', 'text', 'turn-end'])
    expect(agent.sessions).toHaveLength(1)
  })

  test('an approval answer reaches the Agent', async () => {
    await editor({ turns: [[{ type: 'approval-request', id: 'a1', kind: 'shell', detail: 'npm install' }, { type: 'text', text: 'Ran it.' }]] })
    const { seen, nextTurnEnd } = entries()
    const ended = nextTurnEnd()
    host.on('session.entry', ({ entry }) => {
      if (entry.type === 'approval-request') void host.call('session.answerApproval', entry.id, 'allow-once')
    })

    await host.call('session.send', ask)
    await ended

    expect(agent.approvals).toEqual([{ id: 'a1', decision: 'allow-once' }])
    expect(seen.map(({ entry }) => entry.type)).toEqual(['user', 'approval-request', 'text', 'turn-end'])
  })

  test("an Agent error ends the Turn as failed and says why", async () => {
    await editor({ turns: [[{ type: 'error', message: 'Your Claude login has expired.', reason: 'signed-out' }]] })
    const { seen, nextTurnEnd } = entries()
    const ended = nextTurnEnd()

    await host.call('session.send', ask)
    await ended

    expect(seen.slice(1).map(({ entry }) => entry)).toEqual([
      { type: 'error', message: 'Your Claude login has expired.', reason: 'signed-out' },
      { type: 'turn-end', reason: 'failed' },
    ])
  })

  test('sending while a Turn runs is refused (the Queue is ticket 10)', async () => {
    await editor({ turns: [[{ type: 'wait', ms: 300 }]] })

    await host.call('session.send', ask)

    await expect(host.call('session.send', ask)).rejects.toThrow(/Turn is running/)
  })

  test('there is no Session without an open Document, and another Document starts its own', async () => {
    await editor({ turns: [[{ type: 'text', text: 'One.' }]] }, { 'index.html': '', 'about.html': '' })
    const { nextTurnEnd } = entries()
    const ended = nextTurnEnd()
    await host.call('session.send', ask)
    await ended

    await host.call('document.open', 'about.html')
    expect(await host.call('session.current')).toEqual({ document: 'about.html', entries: [] })

    await host.call('document.close')
    expect(await host.call('session.current')).toBeNull()
    await expect(host.call('session.send', ask)).rejects.toThrow(/No Document is open/)
  })
})
