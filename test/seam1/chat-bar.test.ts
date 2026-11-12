import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { SessionEntry } from '../../src/shared/host-api'
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
})

afterEach(async () => {
  host?.dispose()
  await rm(dataDir, { recursive: true, force: true })
  await rm(projectDir, { recursive: true, force: true })
})

async function launch(script: FakeAgentScript = {}) {
  agent = createFakeAgentProvider(script)
  host = createHost({ dataDir, agent })
  await host.call('projects.open', projectDir)
}

/** Sends from the Project page's chat bar and waits for the Turn it starts to end. */
async function sendFromBar(text: string) {
  const entries: { document: string; entry: SessionEntry }[] = []
  const ended = new Promise<void>((resolve) => {
    const off = host.on('session.entry', ({ document, entry }) => {
      entries.push({ document, entry })
      if (entry.type !== 'turn-end') return
      off()
      resolve()
    })
  })
  const opened = await host.call('project.send', text)
  await ended
  return { opened, entries }
}

describe('The Project chat bar', () => {
  test('describing something new creates a Document named from it and starts its Session with the message', async () => {
    await launch({ turns: [[{ type: 'text', text: 'Building it.' }]] })

    const { opened, entries } = await sendFromBar('A summer menu for the café, with prices')

    expect(opened.path).toBe('summer-menu-for-the-cafe.html')
    expect(await readFile(join(projectDir, opened.path), 'utf8')).toBe('')
    expect(await host.call('document.current')).toEqual(opened)
    expect(entries[0]).toEqual({
      document: opened.path,
      entry: { type: 'user', turn: { text: 'A summer menu for the café, with prices', annotations: [] }, checkpoint: expect.any(String) },
    })
    expect(await host.call('checkpoints.list')).toMatchObject([
      { reason: 'turn', document: opened.path, text: 'A summer menu for the café, with prices' },
    ])
    expect(agent.sent).toEqual([{ text: 'A summer menu for the café, with prices', annotations: [] }])
  })

  test("a new Document never takes an existing file's name", async () => {
    await writeFile(join(projectDir, 'poster.html'), '<h1>Old poster</h1>')
    await launch()

    const { opened } = await sendFromBar('A poster')

    expect(opened.path).toBe('poster-2.html')
    expect(await readFile(join(projectDir, 'poster.html'), 'utf8')).toBe('<h1>Old poster</h1>')
  })

  test('@-mentioning an existing Document opens it and sends the message to its Session', async () => {
    await mkdir(join(projectDir, 'campaigns'))
    await writeFile(join(projectDir, 'campaigns', 'christmas.html'), '<h1>Christmas</h1>')
    await launch()
    const before = (await host.call('documents.list')).documents.map((doc) => doc.path)

    const { opened, entries } = await sendFromBar('Make @campaigns/christmas.html warmer')

    expect(opened.path).toBe('campaigns/christmas.html')
    expect((await host.call('documents.list')).documents.map((doc) => doc.path)).toEqual(before)
    expect(entries[0]?.document).toBe('campaigns/christmas.html')
    expect((await host.call('session.current'))?.entries[0]).toEqual({
      type: 'user',
      turn: { text: 'Make @campaigns/christmas.html warmer', annotations: [] },
      checkpoint: expect.any(String),
    })
  })

  test('an @ that names no Document is just part of the description', async () => {
    await launch()

    const { opened } = await sendFromBar('Newsletter like @missing.html')

    expect(opened.path).toBe('newsletter-like-missing-html.html')
  })

  test("a new Document takes the Agent's name for it, made safe as a file name", async () => {
    await launch({ documentName: 'Bakery Sales Dashboard.html' })

    const { opened } = await sendFromBar('let us write a dashboard for my bakery sales, monthly charts')

    expect(opened.path).toBe('bakery-sales-dashboard.html')
  })

  test("the editor's New Document always makes a new one, even when the text @-mentions a Document", async () => {
    await launch({ documentName: 'home-variant' })
    const ended = new Promise<void>((resolve) => {
      const off = host.on('session.entry', ({ entry }) => entry.type === 'turn-end' && (off(), resolve()))
    })

    const opened = await host.call('project.newDocument', 'A variant of @index.html')
    await ended

    expect(opened.path).toBe('home-variant.html')
    expect(await host.call('document.current')).toEqual(opened)
    expect(agent.sent).toEqual([{ text: 'A variant of @index.html', annotations: [] }])
  })
})
