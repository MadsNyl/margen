import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { TurnInput } from '../../src/shared/agent'
import { createHost, type Host } from '../../src/main/host'
import { createFakeAgentProvider, type FakeAgentProvider, type FakeAgentScript } from '../../src/main/agent/fake'

let dataDir: string
let projectDir: string
let host: Host
let agent: FakeAgentProvider

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'margen-data-'))
  projectDir = await mkdtemp(join(tmpdir(), 'margen-project-'))
  await writeFile(join(projectDir, 'index.html'), '<h1>Home</h1>')
  await writeFile(join(projectDir, 'about.html'), '<h1>About</h1>')
})

afterEach(async () => {
  host?.dispose()
  await rm(dataDir, { recursive: true, force: true })
  await rm(projectDir, { recursive: true, force: true })
})

/** Starts Margen (again) on the same data directory, with the Project open. */
async function launch(script: FakeAgentScript = {}, document = 'index.html') {
  host?.dispose()
  agent = createFakeAgentProvider(script)
  host = createHost({ dataDir, agent })
  await host.call('projects.open', projectDir)
  await host.call('document.open', document)
}

async function send(text: string) {
  const turn: TurnInput = { text, annotations: [] }
  const ended = new Promise<void>((resolve) => {
    const off = host.on('session.entry', ({ entry }) => {
      if (entry.type !== 'turn-end') return
      off()
      resolve()
    })
  })
  await host.call('session.send', turn)
  await ended
}

const texts = (entries: { type: string }[]) =>
  entries.flatMap((entry) => ('text' in entry ? [entry.text] : 'turn' in entry ? [(entry.turn as TurnInput).text] : []))

describe('Sessions per Document', () => {
  test("a Document's Session survives a restart and resumes the same Agent session", async () => {
    await launch({ turns: [[{ type: 'text', text: 'Hello.' }]] })
    await send('Make it warmer')
    const before = await host.call('session.current')

    await launch({ turns: [[{ type: 'text', text: 'Again.' }]] })

    const after = await host.call('session.current')
    expect(after).toMatchObject({ document: 'index.html', id: before?.id, number: 1 })
    expect(texts(after?.entries ?? [])).toEqual(['Make it warmer', 'Hello.'])
    await send('And bolder')
    expect(agent.sessions).toEqual([expect.objectContaining({ projectDir, resumeId: 'fake-session-1' })])
  })

  test("Margen's Sessions are stored in its data directory, not the Project folder", async () => {
    await launch()
    await send('Hi')

    expect(await readdir(projectDir)).toEqual(['about.html', 'index.html'])
    expect(await readdir(join(dataDir, 'sessions'))).toHaveLength(1)
  })

  test("switching Documents shows that Document's own active Session", async () => {
    await launch({ turns: [[{ type: 'text', text: 'Home reply.' }], [{ type: 'text', text: 'About reply.' }]] })
    await send('Home ask')
    await host.call('document.open', 'about.html')
    expect(texts((await host.call('session.current'))?.entries ?? [])).toEqual([])
    await send('About ask')

    await host.call('document.open', 'index.html')
    expect(texts((await host.call('session.current'))?.entries ?? [])).toEqual(['Home ask', 'Home reply.'])
    await host.call('document.open', 'about.html')
    expect(texts((await host.call('session.current'))?.entries ?? [])).toEqual(['About ask', 'About reply.'])
  })

  test('New session starts fresh and keeps the old one in the list', async () => {
    await launch({ turns: [[{ type: 'text', text: 'One.' }], [{ type: 'text', text: 'Two.' }]] })
    await send('First ask')
    const first = await host.call('session.current')
    const changed = new Promise((resolve) => host.on('session.changed', resolve))

    const fresh = await host.call('session.new')

    expect(fresh).toMatchObject({ document: 'index.html', number: 2, entries: [] })
    expect(await changed).toEqual(fresh)
    await send('Second ask')
    expect(agent.sessions.map((s) => s.resumeId)).toEqual([undefined, undefined])
    expect(await host.call('sessions.list')).toEqual([
      expect.objectContaining({ id: fresh.id, number: 2, active: true, turns: 1, firstMessage: 'Second ask' }),
      expect.objectContaining({ id: first?.id, number: 1, active: false, turns: 1, firstMessage: 'First ask' }),
    ])
  })

  test('New session on an empty Session keeps it, so no empty Sessions pile up', async () => {
    await launch()
    const empty = await host.call('session.current')

    expect(await host.call('session.new')).toEqual(empty)
    expect(await host.call('sessions.list')).toEqual([])
  })

  test('resuming a past Session shows its chat and continues its Agent session, also after a restart', async () => {
    await launch({ turns: [[{ type: 'text', text: 'One.' }], [{ type: 'text', text: 'Two.' }]] })
    await send('First ask')
    const first = await host.call('session.current')
    await host.call('session.new')
    await send('Second ask')

    await launch({ turns: [[{ type: 'text', text: 'Back.' }]] })
    expect((await host.call('session.current'))?.number).toBe(2)
    const resumed = await host.call('session.resume', first?.id ?? '')

    expect(resumed).toMatchObject({ id: first?.id, number: 1 })
    expect(texts(resumed.entries)).toEqual(['First ask', 'One.'])
    await send('Continue')
    expect(agent.sessions.map((s) => s.resumeId)).toEqual(['fake-session-1'])
    expect((await host.call('sessions.list')).map((s) => [s.number, s.active])).toEqual([
      [2, false],
      [1, true],
    ])

    await launch()
    expect((await host.call('session.current'))?.id).toBe(first?.id)
  })

  test("resuming another Document's Session, or one that doesn't exist, is refused", async () => {
    await launch()
    await send('Home ask')
    const home = await host.call('session.current')
    await host.call('document.open', 'about.html')

    await expect(host.call('session.resume', home?.id ?? '')).rejects.toThrow(/No such Session/)
    await expect(host.call('session.resume', 'nope')).rejects.toThrow(/No such Session/)
  })

  test('says whether a Turn is running, so the editor can ask before switching away from it', async () => {
    await launch({ turns: [[{ type: 'wait', ms: 100 }]] })
    expect(await host.call('session.running')).toBe(false)

    const done = send('Slow')
    expect(await host.call('session.running')).toBe(true)
    await done
    expect(await host.call('session.running')).toBe(false)
    await host.call('document.close')
    expect(await host.call('session.running')).toBe(false)
  })

  test('a Turn cut off by quitting shows as interrupted after the restart', async () => {
    await launch({ turns: [[{ type: 'text', text: 'Starting…' }, { type: 'wait', ms: 5000 }]] })
    await host.call('session.send', { text: 'Long job', annotations: [] })

    await launch()

    const entries = (await host.call('session.current'))?.entries ?? []
    expect(entries.at(-1)).toEqual({ type: 'turn-end', reason: 'interrupted' })
  })

  test('approval answers are stored with the Session and come back on restart and resume', async () => {
    await launch({
      turns: [
        [
          { type: 'permission', id: 'p1', request: { kind: 'shell', command: 'ls' } },
          { type: 'permission', id: 'p2', request: { kind: 'shell', command: 'rm x' } },
          { type: 'text', text: 'Listed.' },
        ],
      ],
    })
    const answers = { p1: 'allow-once', p2: 'deny' } as const
    host.on('session.entry', ({ entry }) => {
      if (entry.type === 'approval-request') void host.call('session.answerApproval', entry.id, answers[entry.id as 'p1' | 'p2'])
    })
    await send('List the files')
    const first = await host.call('session.current')
    const resolved = [
      { type: 'approval-answer', id: 'p1', decision: 'allow-once' },
      { type: 'approval-answer', id: 'p2', decision: 'deny' },
    ]

    await launch()
    expect((await host.call('session.current'))?.entries).toEqual(expect.arrayContaining(resolved))
    await host.call('session.new')
    await send('Something else')
    const resumed = await host.call('session.resume', first?.id ?? '')
    expect(resumed.entries).toEqual(first?.entries)
    expect(resumed.entries).toEqual(expect.arrayContaining(resolved))
  })

  test('the Agent can change other files in the Project during a Document\'s Session', async () => {
    await launch({
      turns: [[{ type: 'tool', tool: 'write', file: 'styles.css', added: 1, removed: 0, content: 'h1 { color: red }' }]],
    })

    await send('Make headings red everywhere')

    expect(await readFile(join(projectDir, 'styles.css'), 'utf8')).toBe('h1 { color: red }')
  })
})
