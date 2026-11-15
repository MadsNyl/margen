import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// New Projects are empty folders under one base directory (~/Margen
// in the app, a temp folder in tests), named after a slug of what the user typed.

/** Keeps folder names readable, and well under the file system's limit. */
const MAX_SLUG = 60

/** Letters that don't decompose into a base letter and an accent. */
const SPELLED_OUT: Record<string, string> = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', đ: 'd', ł: 'l', þ: 'th' }

/** `Summer Menu 2026!` becomes `summer-menu-2026`, `Smørrebrød` becomes `smorrebrod`. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[øæœßđłþ]/g, (letter) => SPELLED_OUT[letter] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-/, '')
    .slice(0, MAX_SLUG)
    .replace(/-$/, '')
  return slug || 'untitled'
}

/** Makes the Project's folder and returns its path. A taken slug gets `-2`, `-3`, … instead. */
export async function makeProjectFolder(baseDir: string, name: string): Promise<string> {
  await mkdir(baseDir, { recursive: true })
  const slug = slugify(name)
  for (let n = 1; ; n++) {
    const path = join(baseDir, n === 1 ? slug : `${slug}-${n}`)
    try {
      // Without `recursive`, mkdir fails on anything already there, so nothing is overwritten.
      await mkdir(path)
      return path
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
}
