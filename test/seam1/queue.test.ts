import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { TurnInput } from '../../src/shared/agent'
import type { HostEvents, SessionEntry } from '../../src/shared/host-api'
import { createHost, type Host } from '../../src/main/host'
import { createFakeAgentProvider, type FakeAgentProvider, type FakeAgentScript } from '../../src/main/agent/fake'

// The Queue: messages sent while a Turn runs wait in Margen and go out one
// Turn at a time, each only after the previous Turn has fully ended.

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

async function editor(script: FakeAgentScript) {
  await writeFile(join(projectDir, 'index.html'), '<h1>Small</h1>')
  agent = createFakeAgentProvider(script)
  host = createHost({ dataDir, agent })
  await host.call('projects.open', projectDir)
  await host.call('document.open', 'index.html')
}

/** Every Session entry and Queue change, and a way to wait for the nth turn-end. */
function watch() {
  const entries: SessionEntry[] = []
  const queues: HostEvents['session.queue'][] = []
  const waiting: { n: number; resolve: () => void }[] = []
  host.on('session.queue', (queue) => queues.push(queue))
  host.on('session.entry', ({ entry }) => {
    entries.push(entry)
    const ended = entries.filter((e) => e.type === 'turn-end').length
    for (const w of waiting.filter((w) => w.n === ended)) w.resolve()
  })
  const turnEnds = (n: number) => new Promise<void>((resolve) => waiting.push({ n, resolve }))
  const summary = () => entries.map((e) => (e.type === 'user' ? `user: ${e.turn.text}` : e.type === 'turn-end' ? `end: ${e.reason}` : e.type))
  return { entries, queues, turnEnds, summary }
}

const message = (text: string): TurnInput => ({ text, annotations: [] })
const slow = [{ type: 'wait' as const, ms: 200 }, { type: 'text' as const, text: 'Done.' }]
const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms))

describe('the Queue', () => {
  test('messages sent during a Turn wait in the Queue and go out in order, each as its own Turn after the previous one ends', async () => {
    await editor({ turns: [slow, slow, slow] })
    const { queues, turnEnds, summary } = watch()
    const allDone = turnEnds(3)

    await host.call('session.send', message('One'))
    await host.call('session.send', message('Two'))
    await host.call('session.send', message('Three'))

    expect(agent.sent.map((turn) => turn.text)).toEqual(['One'])
    expect((await host.call('session.queue'))?.messages.map((m) => m.turn.text)).toEqual(['Two', 'Three'])
    await allDone
    expect(summary()).toEqual([
      'user: One',
      'text',
      'end: done',
      'user: Two',
      'text',
      'end: done',
      'user: Three',
      'text',
      'end: done',
    ])
    expect(agent.sent.map((turn) => turn.text)).toEqual(['One', 'Two', 'Three'])
    expect(agent.sessions).toHaveLength(1)
    expect(queues.map((q) => q.messages.map((m) => m.turn.text))).toEqual([['Two'], ['Two', 'Three'], ['Three'], []])
    expect(await host.call('session.queue')).toEqual({ document: 'index.html', messages: [], held: false })
  })

  test('a queued message removed before it sends never reaches the Agent', async () => {
    await editor({ turns: [slow, slow] })
    const { turnEnds, summary } = watch()

    await host.call('session.send', message('One'))
    await host.call('session.send', message('Two'))
    await host.call('session.send', message('Three'))
    const [two] = (await host.call('session.queue'))?.messages ?? []
    await host.call('session.unqueue', two?.id ?? '')
    await turnEnds(2)
    await settle()

    expect(agent.sent.map((turn) => turn.text)).toEqual(['One', 'Three'])
    expect(summary().filter((line) => line.startsWith('user'))).toEqual(['user: One', 'user: Three'])
  })

  test('Stop interrupts the running Turn, and the Queue holds until the user sends again', async () => {
    await editor({ turns: [[{ type: 'wait', ms: 5000 }], slow, slow] })
    const { turnEnds, summary } = watch()

    await host.call('session.send', message('One'))
    await host.call('session.send', message('Two'))
    const interrupted = turnEnds(1)
    await host.call('session.interrupt')
    await interrupted
    await settle()

    expect(summary()).toEqual(['user: One', 'end: interrupted'])
    expect(agent.sent.map((turn) => turn.text)).toEqual(['One'])
    expect(await host.call('session.queue')).toMatchObject({ messages: [{ turn: message('Two') }], held: true })

    const allDone = turnEnds(3)
    await host.call('session.send', message('Three'))
    await allDone

    expect(agent.sent.map((turn) => turn.text)).toEqual(['One', 'Two', 'Three'])
    expect(await host.call('session.queue')).toMatchObject({ messages: [], held: false })
  })

  test('after an interrupt with nothing queued, the next message sends straight away', async () => {
    await editor({ turns: [[{ type: 'wait', ms: 5000 }], slow] })
    const { turnEnds, summary } = watch()

    const interrupted = turnEnds(1)
    const done = turnEnds(2)
    await host.call('session.send', message('One'))
    await host.call('session.interrupt')
    await interrupted
    await host.call('session.send', message('Two'))
    await done

    expect(summary()).toEqual(['user: One', 'end: interrupted', 'user: Two', 'text', 'end: done'])
  })

  test("each Turn carries the model and effort chosen when it was sent, to the Agent", async () => {
    await editor({ turns: [slow, slow] })
    const { turnEnds } = watch()
    const done = turnEnds(2)

    await host.call('session.send', { ...message('One'), model: 'opus', effort: 'high' })
    await host.call('session.send', { ...message('Two'), model: 'haiku' })
    await done

    expect(agent.sent).toEqual([
      { ...message('One'), model: 'opus', effort: 'high' },
      { ...message('Two'), model: 'haiku' },
    ])
  })

  test('a failed Turn holds the Queue too', async () => {
    await editor({ turns: [[{ type: 'wait', ms: 100 }, { type: 'error', message: 'Claude Code stopped unexpectedly.' }], slow] })
    const { turnEnds, summary } = watch()
    const failed = turnEnds(1)

    await host.call('session.send', message('One'))
    await host.call('session.send', message('Two'))
    await failed
    await settle()

    expect(summary()).toEqual(['user: One', 'error', 'end: failed'])
    expect(await host.call('session.queue')).toMatchObject({ messages: [{ turn: message('Two') }], held: true })
  })

  test('the Queue belongs to the Session: New session drops it and says so', async () => {
    await editor({ turns: [[{ type: 'wait', ms: 5000 }]] })
    const { queues } = watch()

    await host.call('session.send', message('One'))
    await host.call('session.send', message('Two'))
    await host.call('session.new')

    expect(await host.call('session.queue')).toEqual({ document: 'index.html', messages: [], held: false })
    expect(queues.at(-1)).toEqual({ document: 'index.html', messages: [], held: false })
    expect(agent.sent.map((turn) => turn.text)).toEqual(['One'])
  })

  test('the Queue belongs to the open Document: opening another drops it', async () => {
    await writeFile(join(projectDir, 'about.html'), '')
    await editor({ turns: [[{ type: 'wait', ms: 5000 }]] })

    await host.call('session.send', message('One'))
    await host.call('session.send', message('Two'))
    await host.call('document.open', 'about.html')

    expect(await host.call('session.queue')).toEqual({ document: 'about.html', messages: [], held: false })
    await host.call('document.close')
    expect(await host.call('session.queue')).toBeNull()
  })
})
