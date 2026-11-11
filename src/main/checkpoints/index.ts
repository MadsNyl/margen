import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { devNull } from 'node:os'
import { join } from 'node:path'
import { exec } from 'dugite'
import type { Checkpoint } from '@shared/host-api'
import { projectId } from '../projects/document'
import { IGNORED_FOLDERS } from '../projects/documents'

// Checkpoints: a hidden git repository in Margen's data directory whose work
// tree is the Project folder. git runs with GIT_DIR and GIT_WORK_TREE set, so
// it never discovers or touches the Project's own .git. The git is dugite's
// bundled one: /usr/bin/git asks to install the developer tools on Macs that
// don't have them. The `-c` flags keep the user's global config, hooks,
// signing and excludes out of it; the Project's .gitignore files still apply.
// A subfolder that is its own git repo is stored as a gitlink, so its files
// aren't snapshotted or restored.
//
// The list (number, reason, Document, Session, text) is kept in checkpoints.json next
// to the store rather than parsed from commit messages.

export interface CheckpointStore {
  /** Snapshots the Project as it is now. */
  take(meta: Pick<Checkpoint, 'reason' | 'document' | 'session' | 'text'>): Promise<Checkpoint>
  /** Newest first. */
  list(): Promise<Checkpoint[]>
  /** Takes a `revert` Checkpoint, then restores every file to `id`, deleting files made since. Rejects for an unknown id. */
  revert(id: string): Promise<Checkpoint>
}

const EXCLUDE = [...IGNORED_FOLDERS.map((name) => `${name}/`), '.DS_Store'].join('\n') + '\n'

const FLAGS = [
  'core.autocrlf=false',
  'core.quotepath=off',
  `core.hooksPath=${devNull}`,
  `core.excludesFile=${devNull}`,
  'core.fsmonitor=false',
  'commit.gpgsign=false',
  'user.name=Margen',
  'user.email=margen@localhost',
].flatMap((flag) => ['-c', flag])

export function openCheckpoints(dataDir: string, projectDir: string): CheckpointStore {
  let queue: Promise<unknown> = Promise.resolve()
  let ready: Promise<{ store: string; work: string; index: string }> | undefined

  /** One store operation at a time, or git trips over its own index.lock. */
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.then(work)
    queue = next.catch(() => {})
    return next
  }

  async function setup() {
    const work = await realpath(projectDir)
    const dir = join(dataDir, 'projects', projectId(work))
    const store = join(dir, 'checkpoints.git')
    const paths = { store, work, index: join(dir, 'checkpoints.json') }
    if (await exists(store)) return paths
    await mkdir(dir, { recursive: true })
    const init = await exec([...FLAGS, 'init', '-q', '--bare', store], dir)
    if (init.exitCode !== 0) throw new Error(`Checkpoint git init failed: ${init.stderr.trim()}`)
    await writeFile(join(store, 'info', 'exclude'), EXCLUDE)
    await git(paths, ['config', 'core.bare', 'false'])
    await git(paths, ['config', 'core.worktree', work])
    return paths
  }

  async function git(paths: { store: string; work: string }, args: string[]): Promise<string> {
    const result = await exec([...FLAGS, ...args], paths.work, {
      env: { GIT_DIR: paths.store, GIT_WORK_TREE: paths.work, GIT_OPTIONAL_LOCKS: '0' },
    })
    if (result.exitCode !== 0) throw new Error(`Checkpoint git ${args[0]} failed: ${result.stderr.trim()}`)
    return result.stdout.trim()
  }

  async function readIndex(index: string): Promise<Checkpoint[]> {
    try {
      return JSON.parse(await readFile(index, 'utf8')) as Checkpoint[]
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  async function take(meta: Pick<Checkpoint, 'reason' | 'document' | 'session' | 'text'>): Promise<Checkpoint> {
    const paths = await (ready ??= setup())
    const checkpoints = await readIndex(paths.index)
    const number = checkpoints.length + 1
    await git(paths, ['add', '-A', '.'])
    await git(paths, ['commit', '-q', '--allow-empty', '--no-verify', '-m', `Checkpoint ${number} (${meta.reason})`])
    const checkpoint: Checkpoint = { id: await git(paths, ['rev-parse', 'HEAD']), number, takenAt: new Date().toISOString(), ...meta }
    await writeFile(paths.index, JSON.stringify([...checkpoints, checkpoint], null, 2))
    return checkpoint
  }

  return {
    take: (meta) => serial(() => take(meta)),
    list: () =>
      serial(async () => {
        const paths = await (ready ??= setup())
        return (await readIndex(paths.index)).reverse()
      }),
    revert: (id) =>
      serial(async () => {
        const paths = await (ready ??= setup())
        if (!(await readIndex(paths.index)).some((checkpoint) => checkpoint.id === id)) throw new Error(`No such Checkpoint: ${id}`)
        const saved = await take({ reason: 'revert' })
        await git(paths, ['read-tree', '-u', '--reset', id])
        await git(paths, ['clean', '-fdq'])
        return saved
      }),
  }
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  )
}
