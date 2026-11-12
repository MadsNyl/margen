import { lstat, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
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
// signing and excludes out of it. The Project's .gitignore files don't apply
// either: Margen lists the files itself (everything but its ignored folders and
// files over 50 MB) and adds them with `-f`, so a Turn's edit to an ignored file
// can be undone too. A subfolder that is its own git repo is stored as a
// gitlink, so its files aren't snapshotted or restored.
//
// The list (number, reason, Document, Session, text) is kept in checkpoints.json next
// to the store rather than parsed from commit messages.
//
// A Checkpoint belongs to one Document: each snapshot is of the whole folder,
// but a Document's Checkpoints are listed and numbered on their own, and
// reverting to one restores that Document's file only.

export interface CheckpointStore {
  /** Snapshots the Project as it is now. */
  take(meta: Pick<Checkpoint, 'reason' | 'document' | 'session' | 'text'>): Promise<Checkpoint>
  /** Newest first: the Document's own (relative to the Project), or every one when `document` is left out. */
  list(document?: string): Promise<Checkpoint[]>
  /**
   * Takes a `revert` Checkpoint of the same Document, then restores that Document's
   * file to how it was at `id` (deleting it if it didn't exist yet). Other files stay
   * as they are. Rejects for an unknown id.
   */
  revert(id: string): Promise<Checkpoint>
}

/** Bigger files are left out of Checkpoints, so a stray video doesn't fill the store. */
const MAX_FILE_BYTES = 50 * 1024 * 1024

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

  async function git(paths: { store: string; work: string }, args: string[], input?: string): Promise<string> {
    const result = await exec([...FLAGS, ...args], paths.work, {
      env: { GIT_DIR: paths.store, GIT_WORK_TREE: paths.work, GIT_OPTIONAL_LOCKS: '0', GIT_LITERAL_PATHSPECS: '1' },
      ...(input !== undefined && { stdin: input }),
    })
    if (result.exitCode !== 0) throw new Error(`Checkpoint git ${args[0]} failed: ${result.stderr.trim()}`)
    return result.stdout
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
    const number = checkpoints.filter((checkpoint) => checkpoint.document === meta.document).length + 1
    // What the store has and what's in the folder, minus Margen's ignored folders but not the Project's .gitignore.
    // A new subfolder that is its own git repo is listed as `dir/` and left out.
    const listed = (await git(paths, ['ls-files', '-z', '--cached', '--others', `--exclude-from=${join(paths.store, 'info', 'exclude')}`]))
      .split('\0')
      .filter((path) => path && !path.endsWith('/'))
    const large = new Set(await filter(listed, (path) => tooLarge(join(paths.work, path))))
    const add = listed.filter((path) => !large.has(path))
    if (add.length) await git(paths, ['add', '-A', '-f', '--pathspec-from-file=-', '--pathspec-file-nul'], add.join('\0'))
    if (large.size) {
      await git(paths, ['rm', '-q', '--cached', '--ignore-unmatch', '--pathspec-from-file=-', '--pathspec-file-nul'], [...large].join('\0'))
      console.warn(`Checkpoint ${number} leaves out files over 50 MB: ${[...large].join(', ')}`)
    }
    await git(paths, ['commit', '-q', '--allow-empty', '--no-verify', '-m', `Checkpoint ${number} (${meta.reason})`])
    const checkpoint: Checkpoint = { id: (await git(paths, ['rev-parse', 'HEAD'])).trim(), number, takenAt: new Date().toISOString(), ...meta }
    await writeFile(paths.index, JSON.stringify([...checkpoints, checkpoint], null, 2))
    return checkpoint
  }

  return {
    take: (meta) => serial(() => take(meta)),
    list: (document) =>
      serial(async () => {
        const paths = await (ready ??= setup())
        const all = (await readIndex(paths.index)).reverse()
        return document === undefined ? all : all.filter((checkpoint) => checkpoint.document === document)
      }),
    revert: (id) =>
      serial(async () => {
        const paths = await (ready ??= setup())
        const target = (await readIndex(paths.index)).find((checkpoint) => checkpoint.id === id)
        if (!target) throw new Error(`No such Checkpoint: ${id}`)
        const { document } = target
        const saved = await take({ reason: 'revert', ...(document && { document }) })
        if (!document) {
          // From before Checkpoints had a Document: the whole folder goes back.
          await git(paths, ['read-tree', '-u', '--reset', id])
        } else if (await git(paths, ['cat-file', '-e', `${id}:${document}`]).then(() => true, () => false)) {
          await git(paths, ['checkout', id, '--', document])
        } else {
          await rm(join(paths.work, document), { force: true })
        }
        return saved
      }),
  }
}

async function tooLarge(path: string): Promise<boolean> {
  const info = await lstat(path).catch(() => undefined)
  return !!info?.isFile() && info.size > MAX_FILE_BYTES
}

async function filter<T>(items: T[], test: (item: T) => Promise<boolean>): Promise<T[]> {
  const keep = await Promise.all(items.map(test))
  return items.filter((_, i) => keep[i])
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  )
}
