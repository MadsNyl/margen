import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createHost, type Host } from '../../src/main/host'
import { createFakeAgentProvider } from '../../src/main/agent/fake'

// The user's own text edits from the Document view (double-click in Browse).

let dataDir: string
let projectDir: string
let host: Host

const page = '<!doctype html><body><h1>Søster</h1><p>Open <b>daily</b></p></body>'

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'margen-data-'))
  projectDir = await mkdtemp(join(tmpdir(), 'margen-project-'))
  await writeFile(join(projectDir, 'index.html'), page)
})

afterEach(async () => {
  host?.dispose()
  await rm(dataDir, { recursive: true, force: true })
  await rm(projectDir, { recursive: true, force: true })
})

async function open(turns: Parameters<typeof createFakeAgentProvider>[0] = {}) {
  host = createHost({ dataDir, agent: createFakeAgentProvider(turns) })
  await host.call('projects.open', projectDir)
  await host.call('document.open', 'index.html')
}

describe('editing text by hand', () => {
  test('writes the new text into the file after a Checkpoint, so it can be reverted', async () => {
    await open()

    await host.call('document.editText', { selector: 'body > h1', before: 'Søster', after: 'Søster Bakery' })

    expect(await readFile(join(projectDir, 'index.html'), 'utf8')).toBe(page.replace('<h1>Søster</h1>', '<h1>Søster Bakery</h1>'))
    const [checkpoint] = await host.call('checkpoints.list')
    expect(checkpoint).toMatchObject({ reason: 'edit', document: 'index.html', text: 'Søster → Søster Bakery' })

    await host.call('checkpoints.revert', checkpoint?.id ?? '')
    expect(await readFile(join(projectDir, 'index.html'), 'utf8')).toBe(page)
  })

  test('says why when the text has formatting inside, and leaves the file alone', async () => {
    await open()

    await expect(host.call('document.editText', { selector: 'body > p', before: 'Open daily', after: 'Closed' })).rejects.toThrow(/formatting/)
    expect(await readFile(join(projectDir, 'index.html'), 'utf8')).toBe(page)
    expect(await host.call('checkpoints.list')).toEqual([])
  })

  test('waits while a Turn runs, so it never races the Agent', async () => {
    await open({ turns: [[{ type: 'wait', ms: 30_000 }]] })
    await host.call('session.send', { text: 'Make it warmer', annotations: [] })

    await expect(host.call('document.editText', { selector: 'body > h1', before: 'Søster', after: 'x' })).rejects.toThrow(/Turn/)
    expect(await readFile(join(projectDir, 'index.html'), 'utf8')).toBe(page)
    await host.call('session.interrupt')
  })
})
