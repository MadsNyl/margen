import { mkdir, mkdtemp, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createHost, type Host } from '../../src/main/host'
import { createFakeAgentProvider } from '../../src/main/agent/fake'

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

async function files(entries: Record<string, string>) {
  for (const [path, content] of Object.entries(entries)) {
    await mkdir(dirname(join(projectDir, path)), { recursive: true })
    await writeFile(join(projectDir, path), content)
  }
}

const start = (pickFolder?: () => Promise<string | undefined>) =>
  (host = createHost({ dataDir, agent: createFakeAgentProvider(), pickFolder }))
/** Resolves with the first `documents.changed` whose paths match, or fails after a few seconds. */
function documentsBecome(paths: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off()
      reject(new Error(`documents.changed never listed ${paths.join(', ')}`))
    }, 4000)
    const off = host.on('documents.changed', ({ documents }) => {
      if (JSON.stringify(documents.map((d) => d.path)) !== JSON.stringify(paths)) return
      clearTimeout(timer)
      off()
      resolve()
    })
  })
}

const listed = async () => (await host.call('documents.list')).documents.map((d) => d.path)

describe('opening a folder as a Project', () => {
  test('lists every HTML file in it, nested ones too, with name, subfolder and last-edited time', async () => {
    await files({ 'index.html': '<h1>Hi</h1>', 'campaigns/christmas.html': '', 'notes.md': '', 'emails/2026/welcome.html': '' })
    start()

    const project = await host.call('projects.open', projectDir)

    expect(project).toEqual({ path: projectDir, name: basename(projectDir) })
    const { documents } = await host.call('documents.list')
    expect(documents.map(({ path, name, dir }) => ({ path, name, dir }))).toEqual([
      { path: 'index.html', name: 'index.html', dir: '' },
      { path: 'campaigns/christmas.html', name: 'christmas.html', dir: 'campaigns/' },
      { path: 'emails/2026/welcome.html', name: 'welcome.html', dir: 'emails/2026/' },
    ])
    expect(Date.now() - Date.parse(documents.at(0)?.modifiedAt ?? '')).toBeLessThan(60_000)
  })

  test('skips dependency, VCS and build folders and says which ones it hid', async () => {
    await files({
      'index.html': '',
      'node_modules/pkg/readme.html': '',
      '.git/hooks/x.html': '',
      'dist/index.html': '',
      'build/index.html': '',
      '.next/server/page.html': '',
      'out/index.html': '',
      'src/out/index.html': '',
    })
    start()
    await host.call('projects.open', projectDir)

    expect(await listed()).toEqual(['index.html'])
    expect((await host.call('documents.list')).hidden).toEqual(['node_modules', '.git', 'dist', 'build', '.next', 'out'])
  })

  test("skips what the folder's .gitignore excludes", async () => {
    await files({
      '.gitignore': '# generated\ncoverage/\n*.draft.html\n/private.html\n!keep.draft.html\n',
      'index.html': '',
      'about.draft.html': '',
      'keep.draft.html': '',
      'private.html': '',
      'pages/private.html': '',
      'coverage/report.html': '',
      'pages/coverage/x.html': '',
    })
    start()
    await host.call('projects.open', projectDir)

    expect(await listed()).toEqual(['index.html', 'keep.draft.html', 'pages/private.html'])
  })
})

describe('watching the open Project', () => {
  test('pushes the new Documents list when HTML files are added, renamed or removed', async () => {
    await files({ 'index.html': '' })
    start()
    await host.call('projects.open', projectDir)

    let change = documentsBecome(['index.html', 'pages/menu.html'])
    await files({ 'pages/menu.html': '' })
    await change

    change = documentsBecome(['index.html', 'pages/dinner.html'])
    await rename(join(projectDir, 'pages/menu.html'), join(projectDir, 'pages/dinner.html'))
    await change

    change = documentsBecome(['pages/dinner.html'])
    await unlink(join(projectDir, 'index.html'))
    await change

    expect(await listed()).toEqual(['pages/dinner.html'])
  })
})

describe('recent Projects', () => {
  test('opening a folder puts it first in the recents, with its HTML-file count, and that survives a restart', async () => {
    const other = await mkdtemp(join(tmpdir(), 'margen-other-'))
    await files({ 'index.html': '', 'pages/a.html': '', 'node_modules/x.html': '' })
    start()
    const changes: string[][] = []
    host.on('recents.changed', (recents) => changes.push(recents.map((r) => r.path)))

    await host.call('projects.open', projectDir)
    await host.call('projects.open', other)
    await host.call('projects.open', projectDir)

    expect(changes).toEqual([[projectDir], [other, projectDir], [projectDir, other]])
    host.dispose()
    start()
    expect(await host.call('recents.list')).toEqual([
      { path: projectDir, name: basename(projectDir), openedAt: expect.any(String), htmlFiles: 2, missing: false },
      { path: other, name: basename(other), openedAt: expect.any(String), htmlFiles: 0, missing: false },
    ])
    await rm(other, { recursive: true, force: true })
  })

  test("opening a folder adds nothing to it: Margen's own data stays in its data directory", async () => {
    await files({ 'index.html': '' })
    start()
    await host.call('projects.open', projectDir)

    expect(await readdir(projectDir)).toEqual(['index.html'])
    expect(await readdir(dataDir)).toContain('recents.json')
  })

  test('a folder that moved or was deleted is shown as missing and cannot be opened', async () => {
    await files({ 'index.html': '' })
    start()
    await host.call('projects.open', projectDir)
    await rm(projectDir, { recursive: true, force: true })

    expect(await host.call('recents.list')).toMatchObject([{ path: projectDir, htmlFiles: 0, missing: true }])
    await expect(host.call('projects.open', projectDir)).rejects.toThrow(/not found/i)
  })
})

describe('choosing a folder and the current Project', () => {
  test('"Open a folder" asks the folder picker, then opens what it returns', async () => {
    await files({ 'index.html': '' })
    start(async () => projectDir)

    expect(await host.call('projects.choose')).toEqual({ path: projectDir, name: basename(projectDir) })
    expect(await host.call('projects.current')).toEqual({ path: projectDir, name: basename(projectDir) })
    expect(await listed()).toEqual(['index.html'])
  })

  test('cancelling the folder picker keeps things as they were', async () => {
    start(async () => undefined)

    expect(await host.call('projects.choose')).toBeNull()
    expect(await host.call('projects.current')).toBeNull()
    expect(await host.call('recents.list')).toEqual([])
  })

  test('opening and closing a Project tells listeners, and closing empties the Documents list', async () => {
    await files({ 'index.html': '' })
    start()
    const changes: unknown[] = []
    host.on('projects.changed', (project) => changes.push(project))

    await host.call('projects.open', projectDir)
    await host.call('projects.close')

    expect(changes).toEqual([{ path: projectDir, name: basename(projectDir) }, null])
    expect(await host.call('projects.current')).toBeNull()
    expect(await listed()).toEqual([])
  })
})
