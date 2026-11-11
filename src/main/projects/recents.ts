import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Project, RecentProject } from '@shared/host-api'
import { listDocuments } from './documents'

// Recent Projects live in Margen's data directory, never in the user's folder.
// Only the path, name and when it was opened are stored; the HTML-file count
// and whether the folder is missing are read from disk each time they're listed.

const MAX_RECENTS = 20

/** One entry in `recents.json`. */
export interface StoredRecent extends Project {
  openedAt: string
}

const file = (dataDir: string) => join(dataDir, 'recents.json')

async function readStored(dataDir: string): Promise<StoredRecent[]> {
  try {
    return JSON.parse(await readFile(file(dataDir), 'utf8')) as StoredRecent[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function writeStored(dataDir: string, recents: StoredRecent[]): Promise<void> {
  await mkdir(dataDir, { recursive: true })
  await writeFile(file(dataDir), JSON.stringify(recents, null, 2))
}

export async function isFolder(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined))?.isDirectory() ?? false
}

export async function listRecents(dataDir: string): Promise<RecentProject[]> {
  return Promise.all(
    (await readStored(dataDir)).map(async ({ path, name, openedAt }) => {
      const missing = !(await isFolder(path))
      const htmlFiles = missing ? 0 : (await listDocuments(path)).documents.length
      return { path, name, openedAt, htmlFiles, missing }
    }),
  )
}

/** Puts a Project first in the recents. */
export async function recordOpened(dataDir: string, project: Project, openedAt = new Date()): Promise<void> {
  const rest = (await readStored(dataDir)).filter((recent) => recent.path !== project.path)
  await writeStored(dataDir, [{ ...project, openedAt: openedAt.toISOString() }, ...rest].slice(0, MAX_RECENTS))
}

export async function clearRecents(dataDir: string): Promise<void> {
  await writeStored(dataDir, [])
}
