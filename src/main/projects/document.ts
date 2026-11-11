import { createHash } from 'node:crypto'
import { watch, type FSWatcher } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { basename, resolve, sep } from 'node:path'
import { IGNORED_FOLDERS } from './documents'
import { inProject } from './inside'

// The open Document: the URL the Document view loads it from, which files that
// URL may serve, and the debounced watch that tells the view to reload.

export const DOCUMENT_SCHEME = 'margen-doc'

/** How long the folder must be quiet after a write before the view reloads. */
const SETTLE_MS = 200
/** How often the Document's own file is checked, backing up file events that macOS delivers late or drops. */
const POLL_MS = 500

/** A stable id for a Project folder: the host part of its `margen-doc://` URLs, so its origin never changes. */
export function projectId(projectDir: string): string {
  return createHash('sha256').update(resolve(projectDir)).digest('hex').slice(0, 16)
}

/** `margen-doc://<project id>/<path>` for a path relative to the Project, with `/` separators. */
export function documentUrl(projectDir: string, path: string): string {
  return `${DOCUMENT_SCHEME}://${projectId(projectDir)}/${path.split('/').map(encodeURIComponent).join('/')}`
}

/** The file inside the Project folder a `margen-doc://` URL points at, or `null` if it points anywhere else, also through a symlink. */
export function resolveDocumentUrl(projectDir: string, url: string): string | null {
  let parsed: URL
  let path: string
  try {
    parsed = new URL(url)
    path = decodeURIComponent(parsed.pathname)
  } catch {
    return null
  }
  if (parsed.protocol !== `${DOCUMENT_SCHEME}:` || parsed.host !== projectId(projectDir) || path.includes('\0')) return null
  const root = resolve(projectDir)
  const file = resolve(root, '.' + path)
  // Resolved through symlinks too, so a link in the Project can't serve a file outside it.
  return file.startsWith(root + sep) && inProject(root, file) ? file : null
}

/** What the Document view gets for a margen-doc:// request: the file, and for HTML the content type to serve it with. */
export interface DocumentFile {
  file: string
  /** Set for HTML. Without it, the file's type is left to the file loader. */
  contentType?: string
}

/**
 * Serves HTML as UTF-8 when it doesn't name a charset in its first 1024 bytes
 * (where browsers look), as agents write UTF-8 and a browser would otherwise
 * guess windows-1252. A charset the file names is left to win.
 */
export async function documentFile(file: string): Promise<DocumentFile> {
  if (!/\.html?$/i.test(file)) return { file }
  const head = Buffer.alloc(1024)
  const handle = await open(file).catch(() => undefined)
  if (!handle) return { file }
  const { bytesRead } = await handle.read(head, 0, head.length, 0).finally(() => handle.close())
  const named = /<meta[^>]+charset\s*=/i.test(head.subarray(0, bytesRead).toString('latin1'))
  return named ? { file } : { file, contentType: 'text/html; charset=utf-8' }
}

/**
 * Calls `onChange` once the Project folder settles after the Document, or any
 * file it may load (CSS, scripts, images), changed. Other HTML files, hidden
 * files and ignored folders don't count. Returns a function that stops watching.
 *
 * A file event only counts when the file's size or mtime really changed:
 * macOS can report writes made just before the watch began, report one write
 * more than once, and report the folder itself.
 */
export function watchDocument(projectDir: string, path: string, onChange: () => void): () => void {
  let timer: NodeJS.Timeout | undefined
  const counts = (filename: string) => {
    const parts = filename.split(/[\\/]/)
    if (parts.some((part) => part.startsWith('.') || IGNORED_FOLDERS.includes(part))) return false
    return parts.join('/') === path || !/\.html$/i.test(filename)
  }

  // `Date.now()` is whole milliseconds and mtimes aren't: a file written just before now can have an mtime
  // a fraction of a ms after it, so the watch counts as begun at the end of this millisecond.
  const startedAt = Date.now() + 1
  /** Each file's size and mtime as last seen, by its path relative to the Project. */
  const known = new Map<string, string>()
  const look = (rel: string) =>
    stat(resolve(projectDir, rel)).then(
      (s) => ({ signature: `${s.size}:${s.mtimeMs}`, before: s.mtimeMs < startedAt }),
      () => ({ signature: 'gone', before: false }),
    )
  /** Whether `rel` changed since it was last seen; one not seen yet changed if it did so after the watch began. */
  const changed = async (rel: string) => {
    const { signature, before } = await look(rel)
    const last = known.get(rel)
    known.set(rel, signature)
    // macOS reports a change to the folder itself under the folder's own name, which isn't a file in it.
    if (last === undefined && signature === 'gone' && rel === basename(projectDir)) return false
    return last === undefined ? !before : last !== signature
  }

  let stopped = false
  const settle = () => {
    clearTimeout(timer)
    timer = setTimeout(fire, SETTLE_MS)
  }
  // One reload per settled change, whichever noticed it first: the Document's state is then seen by both.
  const fire = async () => {
    const { signature } = await look(path)
    known.set(path, signature)
    seen = signature
    if (!stopped) onChange()
  }

  let watcher: FSWatcher | undefined
  try {
    watcher = watch(projectDir, { recursive: true }, (_type, filename) => {
      if (!filename || !counts(filename)) return
      const rel = filename.split(/[\\/]/).join('/')
      void changed(rel).then((yes) => yes && !stopped && settle())
    })
    watcher.on('error', () => watcher?.close())
  } catch {
    watcher = undefined
  }

  // Backs up the watcher for the Document itself, whose events macOS can deliver late or drop.
  let seen: string | undefined
  const check = async () => {
    const { signature } = await look(path)
    if (stopped) return
    if (seen !== undefined && signature !== seen) {
      known.set(path, signature)
      settle()
    }
    seen = signature
  }
  void check()
  const poll = setInterval(() => void check(), POLL_MS)

  return () => {
    stopped = true
    clearTimeout(timer)
    clearInterval(poll)
    watcher?.close()
  }
}
