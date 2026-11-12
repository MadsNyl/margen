import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { stat, unlink } from 'node:fs/promises'
import { promisify } from 'node:util'

// Fetching a voice pack's archive. The bytes go to a `.partial` file as they
// arrive; a download that was cut off (or the app quit) asks for the rest with
// a Range request next time. A finished file must match the release's sha256.

export interface ArchiveDownload {
  url: string
  /** The `.partial` file the archive is written to. */
  file: string
  size: number
  sha256: string
  /** Bytes on disk so far, as they arrive. */
  onProgress: (received: number) => void
  fetch: typeof globalThis.fetch
}

export async function downloadArchive({ url, file, size, sha256, onProgress, fetch }: ArchiveDownload): Promise<void> {
  let have = await stat(file).then((s) => s.size, () => 0)
  if (have > size) {
    await unlink(file)
    have = 0
  }
  if (have < size) {
    const response = await fetch(url, have ? { headers: { range: `bytes=${have}-` } } : {})
    if (!response.ok || !response.body) throw new Error(`The download failed (HTTP ${response.status})`)
    // A server that ignores Range sends the whole file again.
    if (response.status !== 206) have = 0
    const out = createWriteStream(file, { flags: have ? 'a' : 'w' })
    const closed = new Promise<void>((resolve, reject) => out.on('close', resolve).on('error', reject))
    try {
      onProgress(have)
      for await (const chunk of response.body) {
        if (!out.write(chunk)) await new Promise<void>((resolve) => out.once('drain', () => resolve()))
        have += chunk.length
        onProgress(have)
      }
    } finally {
      out.end()
      await closed
    }
  }
  if ((await sha256Of(file)) !== sha256) {
    await unlink(file)
    throw new Error('The download was damaged (its checksum doesn’t match). Try again.')
  }
}

function sha256Of(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

/** Unpacks a `.tar.bz2` into `dest` with the system's tar (bsdtar on macOS and Windows 10+). */
export async function extractArchive(archive: string, dest: string): Promise<void> {
  await promisify(execFile)('tar', ['-xjf', archive, '-C', dest])
}
