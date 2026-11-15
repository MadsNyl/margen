import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createFakeAgentProvider } from '../../src/main/agent/fake'
import { createHost, type Host } from '../../src/main/host'
import { posterFile } from '../../src/main/templates/poster'
import { slidesFile } from '../../src/main/templates/slides'
import { PAGES, type Page } from '../../src/shared/templates'

let dataDir: string
let projectDir: string
let host: Host

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'margen-data-'))
  projectDir = await mkdtemp(join(tmpdir(), 'margen-project-'))
})

afterEach(async () => {
  host?.dispose()
  await rm(dataDir, { recursive: true, force: true })
  await rm(projectDir, { recursive: true, force: true })
})

/** A pretend printer: records what it was asked to print and answers with bytes naming it. */
async function launch(save: (defaultPath: string) => string | undefined = (path) => path) {
  await writeFile(join(projectDir, 'poster.html'), posterFile())
  await writeFile(join(projectDir, 'deck.html'), slidesFile())
  await writeFile(join(projectDir, 'page.html'), '<h1>Neither</h1>')
  const printed: { url: string; page: Page }[] = []
  const defaults: string[] = []
  host = createHost({
    dataDir,
    agent: createFakeAgentProvider({}),
    printPdf: async (url, page) => (printed.push({ url, page }), new TextEncoder().encode(`%PDF ${url}`)),
    pickSaveFile: async (defaultPath) => (defaults.push(defaultPath), save(defaultPath)),
  })
  await host.call('projects.open', projectDir)
  return { printed, defaults }
}

describe('Exporting to PDF', () => {
  test('a Poster prints on one A4 page, saved where the user chose in the Project folder', async () => {
    const { printed, defaults } = await launch()
    const { url } = await host.call('document.open', 'poster.html')

    const saved = await host.call('document.exportPdf')

    expect(defaults).toEqual([join(projectDir, 'poster.pdf')])
    expect(saved).toBe(join(projectDir, 'poster.pdf'))
    expect(printed).toEqual([{ url, page: PAGES.a4 }])
    expect(await readFile(join(projectDir, 'poster.pdf'), 'utf8')).toBe(`%PDF ${url}`)
  })

  test('Slides print at the 16:9 slide size', async () => {
    const { printed } = await launch()
    await host.call('document.open', 'deck.html')

    expect(await host.call('document.exportPdf')).toBe(join(projectDir, 'deck.pdf'))
    expect(printed.map((p) => p.page)).toEqual([PAGES.slide])
  })

  test('a cancelled Save dialog prints nothing', async () => {
    const { printed } = await launch(() => undefined)
    await host.call('document.open', 'deck.html')

    expect(await host.call('document.exportPdf')).toBeNull()
    expect(printed).toEqual([])
  })

  test('only a Poster or Slides exports to PDF, as its file is now', async () => {
    const { printed } = await launch()
    await host.call('document.open', 'page.html')
    await expect(host.call('document.exportPdf')).rejects.toThrow(/Poster or Slides/)

    await host.call('document.open', 'deck.html')
    await writeFile(join(projectDir, 'deck.html'), '<h1>No longer a deck</h1>')
    await expect(host.call('document.exportPdf')).rejects.toThrow(/Poster or Slides/)
    expect(printed).toEqual([])
  })
})
