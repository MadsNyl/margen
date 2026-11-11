import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createHost, type Host } from '../../src/main/host'
import { createFakeAgentProvider } from '../../src/main/agent/fake'

let dataDir: string
let projectsDir: string
let host: Host

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'margen-data-'))
  // Stands in for ~/Documents/Margen; it doesn't exist until the first Project is made.
  projectsDir = join(await mkdtemp(join(tmpdir(), 'margen-documents-')), 'Margen')
  host = createHost({ dataDir, agent: createFakeAgentProvider(), projectsDir })
})

afterEach(async () => {
  host.dispose()
  await rm(dataDir, { recursive: true, force: true })
  await rm(join(projectsDir, '..'), { recursive: true, force: true })
})

describe('making a new Project', () => {
  test('creates an empty, slugged folder under the base directory and opens it', async () => {
    const project = await host.call('projects.create', 'Summer Menu 2026!')

    expect(project).toEqual({ path: join(projectsDir, 'summer-menu-2026'), name: 'summer-menu-2026' })
    expect(await readdir(project.path)).toEqual([])
    expect(await host.call('projects.current')).toEqual(project)
    expect(await host.call('documents.list')).toEqual({ documents: [], hidden: [] })
  })

  test('a name already taken gets the next free slug, leaving the existing folder alone', async () => {
    await mkdir(join(projectsDir, 'menu'), { recursive: true })
    await writeFile(join(projectsDir, 'menu', 'index.html'), '<h1>Old</h1>')
    await writeFile(join(projectsDir, 'menu-2'), 'a file, not a folder')

    const project = await host.call('projects.create', 'Menu')

    expect(project.path).toBe(join(projectsDir, 'menu-3'))
    expect(await readdir(join(projectsDir, 'menu'))).toEqual(['index.html'])
    expect((await host.call('projects.create', 'menu')).name).toBe('menu-4')
  })

  test('accented letters keep their base letter, and a name with no letters becomes untitled', async () => {
    expect((await host.call('projects.create', 'Smørrebrød & Café Ærø')).name).toBe('smorrebrod-cafe-aero')
    expect((await host.call('projects.create', '  ★ ★  ')).name).toBe('untitled')
    expect((await host.call('projects.create', 'word '.repeat(100))).name).toBe(`${'word-'.repeat(11)}word`)
  })

  test('appears first in the recent Projects', async () => {
    const recents: string[][] = []
    host.on('recents.changed', (list) => recents.push(list.map((r) => r.name)))

    await host.call('projects.create', 'Invitation')

    expect(recents).toEqual([['invitation']])
    expect(await host.call('recents.list')).toMatchObject([
      { path: join(projectsDir, 'invitation'), name: 'invitation', htmlFiles: 0, missing: false },
    ])
  })
})
