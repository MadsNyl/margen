import { realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'

// Agents report paths resolved (`/private/tmp/…` for `/tmp/…`), so both sides
// are resolved before a path is compared with the Project folder.

/** `path` with symlinks resolved, as far as it exists: a file about to be created resolves through its folder. */
export function realPath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    const parent = dirname(path)
    return parent === path ? path : join(realPath(parent), basename(path))
  }
}

/**
 * Where `path` is in the Project, relative with `/` separators (`''` for the folder itself),
 * or `null` when it's outside. `root` is the Project folder; a relative `path` is taken from it.
 */
export function inProject(root: string, path: string): string | null {
  const realRoot = realPath(root)
  const rel = relative(realRoot, realPath(isAbsolute(path) ? path : join(root, path)))
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null
  return rel.split(sep).join('/')
}
