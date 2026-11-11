import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import ignore, { type Ignore } from 'ignore'
import type { DocumentInfo, DocumentList } from '@shared/host-api'

// Document discovery: every `.html` file in a Project folder, skipping
// dependency, VCS and build folders and anything a .gitignore excludes: the
// folder's own and those in its subfolders, each for its own folder, the
// deepest winning as in git.

/** Folders never scanned, in the order the Project page names them. */
export const IGNORED_FOLDERS = ['node_modules', '.git', 'dist', 'build', '.next', 'out']

/** One folder's .gitignore: `base` is the folder, relative with a trailing `/` (`''` for the Project). */
interface Rules {
  base: string
  rules: Ignore
}

export async function listDocuments(projectDir: string): Promise<DocumentList> {
  const documents: DocumentInfo[] = []
  const hidden = new Set<string>()

  async function walk(rel: string, outer: Rules[]): Promise<void> {
    const gitignore = await readFile(join(projectDir, rel, '.gitignore'), 'utf8').catch(() => undefined)
    const rules = gitignore === undefined ? outer : [...outer, { base: rel, rules: ignore().add(gitignore) }]
    const entries = await readdir(join(projectDir, rel), { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const path = rel + entry.name
      if (entry.isDirectory()) {
        if (IGNORED_FOLDERS.includes(entry.name)) hidden.add(entry.name)
        else if (!ignored(rules, path + '/')) await walk(path + '/', rules)
      } else if (entry.isFile() && /\.html$/i.test(entry.name) && !ignored(rules, path)) {
        const info = await stat(join(projectDir, path)).catch(() => undefined)
        if (info) documents.push({ path, name: entry.name, dir: rel, modifiedAt: info.mtime.toISOString() })
      }
    }
  }

  await walk('', [])
  documents.sort((a, b) => a.dir.localeCompare(b.dir) || a.name.localeCompare(b.name))
  return { documents, hidden: IGNORED_FOLDERS.filter((name) => hidden.has(name)) }
}

/** Whether the .gitignore files over `path` exclude it: the deepest one with a rule for it decides. */
function ignored(rules: Rules[], path: string): boolean {
  for (const { base, rules: level } of rules.toReversed()) {
    const { ignored, unignored } = level.test(path.slice(base.length))
    if (ignored) return true
    if (unignored) return false
  }
  return false
}
