import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { exec } from 'dugite'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { HostEvents, SessionEntry } from '../../src/shared/host-api'
import { createHost, type Host } from '../../src/main/host'
import { createFakeAgentProvider, type FakeAgentScript } from '../../src/main/agent/fake'

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

async function write(files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(projectDir, path)), { recursive: true })
    await writeFile(join(projectDir, path), content)
  }
}

/** Every file under the Project (or `dir`), relative, with its content. */
async function tree(dir = projectDir): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    files[path.slice(dir.length + 1)] = await readFile(path, 'utf8')
  }
  return files
}

async function editor(script: FakeAgentScript, document = 'index.html') {
  host = createHost({ dataDir, agent: createFakeAgentProvider(script) })
  await host.call('projects.open', projectDir)
  await host.call('document.open', document)
}

/** Sends a Turn and resolves with its entries once it has ended. */
async function turn(text: string): Promise<SessionEntry[]> {
  const seen: SessionEntry[] = []
  const ended = new Promise<void>((resolve) => {
    const off = host.on('session.entry', ({ entry }) => {
      seen.push(entry)
      if (entry.type === 'turn-end') {
        off()
        resolve()
      }
    })
  })
  await host.call('session.send', { text, annotations: [] })
  await ended
  return seen
}

function checkpointOf(entries: SessionEntry[]): string {
  const user = entries.find((entry) => entry.type === 'user')
  if (!user?.checkpoint) throw new Error('The Turn has no Checkpoint')
  return user.checkpoint
}

/** Runs the user's own git in the Project, as they would in a terminal, without refreshing the index. */
async function userGit(...args: string[]): Promise<string> {
  const result = await exec(['-c', 'user.name=U', '-c', 'user.email=u@x', '-c', 'commit.gpgsign=false', ...args], projectDir, {
    env: { GIT_OPTIONAL_LOCKS: '0' },
  })
  if (result.exitCode !== 0) throw new Error(result.stderr)
  return result.stdout
}

/** Every file in the Project's .git, byte for byte. */
async function dotGit() {
  const files: Record<string, string> = {}
  for (const entry of await readdir(join(projectDir, '.git'), { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) files[join(entry.parentPath, entry.name)] = (await readFile(join(entry.parentPath, entry.name))).toString('base64')
  }
  return files
}

const before = {
  'index.html': '<link rel="stylesheet" href="styles.css"><h1>Small</h1>',
  'styles.css': 'h1 { color: red }',
  'about.html': '<h1>About</h1>',
  'img/logo.svg': '<svg/>',
}

describe('Checkpoints', () => {
  test('reverting undoes every edit, creation and deletion the Turn made', async () => {
    await write(before)
    await editor({
      turns: [
        [
          { type: 'tool', tool: 'edit', file: 'index.html', content: '<h1>Big</h1>' },
          { type: 'tool', tool: 'edit', file: 'styles.css', content: 'h1 { color: blue }' },
          { type: 'tool', tool: 'write', file: 'blog/post.html', content: '<h1>New</h1>' },
          { type: 'tool', tool: 'shell', name: 'Bash', detail: 'rm about.html img/logo.svg', removes: ['about.html', 'img/logo.svg'] },
        ],
      ],
    })

    const entries = await turn('Redo the site')
    expect(await tree()).toEqual({ 'index.html': '<h1>Big</h1>', 'styles.css': 'h1 { color: blue }', 'blog/post.html': '<h1>New</h1>' })

    await host.call('checkpoints.revert', checkpointOf(entries))

    expect(await tree()).toEqual(before)
    expect(await readdir(projectDir)).not.toContain('blog')
  })

  test("a Project that is its own git repo keeps its .git, branches and status untouched", async () => {
    await write({ ...before, '.gitignore': 'secret.log\n' })
    await userGit('init', '-q', '-b', 'main')
    await userGit('add', '-A')
    await userGit('commit', '-q', '-m', 'first')
    await userGit('branch', 'feature')
    await write({ 'styles.css': 'h1 { color: green }', 'draft.html': '<p>wip</p>' })
    const status = await userGit('status', '--porcelain', '--branch')
    const branches = await userGit('branch', '--list', '-v')
    const git = await dotGit()
    const project = await tree()
    await editor({
      turns: [
        [
          { type: 'tool', tool: 'edit', file: 'index.html', content: '<h1>Big</h1>' },
          { type: 'tool', tool: 'write', file: 'new.html', content: '<h1>New</h1>' },
          { type: 'tool', tool: 'shell', name: 'Bash', detail: 'rm draft.html', removes: ['draft.html'] },
        ],
      ],
    })

    const entries = await turn('Change things')
    expect(await dotGit()).toEqual(git)
    await host.call('checkpoints.revert', checkpointOf(entries))

    expect(await dotGit()).toEqual(git)
    expect(await tree()).toEqual(project)
    expect(await userGit('status', '--porcelain', '--branch')).toBe(status)
    expect(await userGit('branch', '--list', '-v')).toBe(branches)
  })

  test('ignored folders and .gitignored files are left out: not snapshotted, not restored, not deleted', async () => {
    await write({
      ...before,
      '.gitignore': '*.log\ncache/\n',
      'node_modules/lib/index.js': 'v1',
      'dist/app.js': 'v1',
      'debug.log': 'v1',
      'cache/data.json': 'v1',
    })
    await editor({
      turns: [
        [
          { type: 'tool', tool: 'edit', file: 'index.html', content: '<h1>Big</h1>' },
          { type: 'tool', tool: 'write', file: 'node_modules/lib/index.js', content: 'v2' },
          { type: 'tool', tool: 'write', file: 'node_modules/new/index.js', content: 'new' },
          { type: 'tool', tool: 'write', file: 'dist/app.js', content: 'v2' },
          { type: 'tool', tool: 'write', file: 'debug.log', content: 'v2' },
          { type: 'tool', tool: 'write', file: 'cache/more.json', content: 'new' },
        ],
      ],
    })

    const entries = await turn('Build it')
    await host.call('checkpoints.revert', checkpointOf(entries))

    expect(await tree()).toEqual({
      ...before,
      '.gitignore': '*.log\ncache/\n',
      'node_modules/lib/index.js': 'v2',
      'node_modules/new/index.js': 'new',
      'dist/app.js': 'v2',
      'debug.log': 'v2',
      'cache/data.json': 'v1',
      'cache/more.json': 'new',
    })
  })

  test('a Checkpoint is taken before every Turn and listed newest first, across Documents and restarts', async () => {
    await write(before)
    await editor({ turns: [[{ type: 'tool', tool: 'edit', file: 'index.html', content: '<h1>One</h1>' }], [], []] })
    const changed: HostEvents['checkpoints.changed'][] = []
    host.on('checkpoints.changed', (list) => changed.push(list))

    const first = checkpointOf(await turn('First'))
    const second = checkpointOf(await turn('Second'))
    await host.call('document.open', 'about.html')
    const third = checkpointOf(await turn('On about'))

    const list = await host.call('checkpoints.list')
    expect(list.map(({ id, number, reason, document, text }) => ({ id, number, reason, document, text }))).toEqual([
      { id: third, number: 3, reason: 'turn', document: 'about.html', text: 'On about' },
      { id: second, number: 2, reason: 'turn', document: 'index.html', text: 'Second' },
      { id: first, number: 1, reason: 'turn', document: 'index.html', text: 'First' },
    ])
    expect(changed.at(-1)).toEqual(list)

    host.dispose()
    host = createHost({ dataDir, agent: createFakeAgentProvider() })
    await host.call('projects.open', projectDir)
    expect(await host.call('checkpoints.list')).toEqual(list)
  })

  test('a revert can itself be undone: it takes a Checkpoint first', async () => {
    await write(before)
    await editor({ turns: [[{ type: 'tool', tool: 'edit', file: 'index.html', content: '<h1>Big</h1>' }]] })
    const entries = await turn('Bigger')
    const after = await tree()

    await host.call('checkpoints.revert', checkpointOf(entries))
    const [saved] = await host.call('checkpoints.list')
    expect(saved).toMatchObject({ number: 2, reason: 'revert' })
    if (!saved) return
    await host.call('checkpoints.revert', saved.id)

    expect(await tree()).toEqual(after)
  })

  test('reverting is refused while a Turn runs, and for an unknown Checkpoint', async () => {
    await write(before)
    await editor({ turns: [[{ type: 'wait', ms: 200 }]] })
    const started = new Promise<string>((resolve) =>
      host.on('session.entry', ({ entry }) => entry.type === 'user' && entry.checkpoint && resolve(entry.checkpoint)),
    )
    await expect(host.call('checkpoints.revert', 'nope')).rejects.toThrow(/No such Checkpoint/)
    await host.call('session.send', { text: 'Slow', annotations: [] })

    await expect(host.call('checkpoints.revert', await started)).rejects.toThrow(/Turn is running/)
  })
})
