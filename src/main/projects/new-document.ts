import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { slugify } from './new-project'

// The Project page's chat bar makes a new Document from a description: an
// empty file at the top of the Project, named after the description's first words.

/** Enough words to tell Documents apart, few enough to stay a readable file name. */
const NAME_WORDS = 5

/** `A summer menu for the café, with prices` becomes `summer-menu-for-the-cafe`. */
export function documentSlug(description: string): string {
  const words = slugify(description).split('-')
  if (words.length > 1 && ['a', 'an', 'the'].includes(words[0] ?? '')) words.shift()
  return words.slice(0, NAME_WORDS).join('-')
}

/** Makes the empty file and returns its path relative to the Project. A taken name gets `-2`, `-3`, … instead. */
export async function makeDocumentFile(projectDir: string, description: string): Promise<string> {
  const slug = documentSlug(description)
  for (let n = 1; ; n++) {
    const path = `${n === 1 ? slug : `${slug}-${n}`}.html`
    try {
      // `wx` fails on anything already there, so nothing is overwritten.
      await writeFile(join(projectDir, path), '', { flag: 'wx' })
      return path
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
}

/**
 * The existing Document a message `@`-mentions, if any: the first `@path` that
 * names one of `documents` (paths relative to the Project, as in `DocumentInfo.path`).
 */
export function mentionedDocument(text: string, documents: string[]): string | undefined {
  for (const [, path] of text.matchAll(/(?:^|\s)@(\S+)/g)) {
    const clean = path?.replace(/[.,;:!?)]+$/, '')
    const found = documents.find((doc) => doc === path || doc === clean)
    if (found) return found
  }
  return undefined
}
