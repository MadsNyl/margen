import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import ignore, { type Ignore } from 'ignore'
import type { DocumentInfo, DocumentList } from '@shared/host-api'

// Document discovery: every `.html` file in a Project folder, skipping
// dependency, VCS and build folders and anything the folder's .gitignore excludes.

/** Folders never scanned, in the order the Project page names them. */
export const IGNORED_FOLDERS = ['node_modules', '.git', 'dist', 'build', '.next', 'out']

export async function listDocuments(projectDir: string): Promise<DocumentList> {
  const gitignore = await readGitignore(projectDir)
  const documents: DocumentInfo[] = []
  const hidden = new Set<string>()

  async function walk(rel: string): Promise<void> {
    const entries = await readdir(join(projectDir, rel), { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const path = rel + entry.name
      if (entry.isDirectory()) {
        if (IGNORED_FOLDERS.includes(entry.name)) hidden.add(entry.name)
        else if (!gitignore.ignores(path + '/')) await walk(path + '/')
      } else if (entry.isFile() && /\.html$/i.test(entry.name) && !gitignore.ignores(path)) {
        const info = await stat(join(projectDir, path)).catch(() => undefined)
        if (info) documents.push({ path, name: entry.name, dir: rel, modifiedAt: info.mtime.toISOString() })
      }
    }
  }

  await walk('')
  documents.sort((a, b) => a.dir.localeCompare(b.dir) || a.name.localeCompare(b.name))
  return { documents, hidden: IGNORED_FOLDERS.filter((name) => hidden.has(name)) }
}

async function readGitignore(projectDir: string): Promise<Ignore> {
  const rules = await readFile(join(projectDir, '.gitignore'), 'utf8').catch(() => '')
  return ignore().add(rules)
}
