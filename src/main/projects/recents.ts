import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RecentProject } from '@shared/host-api'

// Recent Projects live in Margen's data directory, never in the user's folder.

const file = (dataDir: string) => join(dataDir, 'recents.json')

export async function readRecents(dataDir: string): Promise<RecentProject[]> {
  try {
    return JSON.parse(await readFile(file(dataDir), 'utf8')) as RecentProject[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export async function writeRecents(dataDir: string, recents: RecentProject[]): Promise<void> {
  await writeFile(file(dataDir), JSON.stringify(recents, null, 2))
}
