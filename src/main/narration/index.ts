import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { narrationEnd, parseNarration, voiceMarker } from '@shared/narration'
import type { SpokenAudio } from '@shared/voices'
import type { VideoNarration } from '@shared/host-api'
import { decodeWav } from '../voices/wav'
import { mixNarration } from './mix'

// An Animation video's narration in main: its lines spoken with its Voice and
// kept in `<dataDir>/narration/`, one WAV per Voice and text, so a line is
// spoken once however often it's played, measured or exported; and the one
// WAV of all its lines the export puts under the video.

export interface NarrationDeps {
  /** `<dataDir>/narration`. */
  dir: string
  /** Speaks with an installed Voice (`Voices.speak`). */
  speak(voice: string, text: string): Promise<SpokenAudio>
}

export interface NarrationAudio {
  /** A line spoken with `voice`, from the cache when it's been spoken before. */
  speak(voice: string, text: string): Promise<SpokenAudio>
  /**
   * The narration of the video in `file` as one WAV written beside the cache, and when its last line ends
   * (seconds), or `undefined` for a silent video (no Voice or no lines). Rejects when its Voice isn't on this Mac.
   * The caller removes the file.
   */
  track(file: string): Promise<NarrationTrack | undefined>
}

export interface NarrationTrack {
  file: string
  /** When the last line ends, in seconds from the start of the video. */
  end: number
}

/** The narration as the video's file has it now; a file that can't be read has none. */
export async function readNarration(file: string): Promise<VideoNarration> {
  const html = await readFile(file, 'utf8').catch(() => '')
  const voice = voiceMarker(html)
  return { ...(voice && { voice }), ...parseNarration(html) }
}

export function createNarrationAudio({ dir, speak: say }: NarrationDeps): NarrationAudio {
  const speaking = new Map<string, Promise<SpokenAudio>>()

  async function spoken(key: string, voice: string, text: string): Promise<SpokenAudio> {
    const file = join(dir, `${key}.wav`)
    const cached = await readFile(file).catch(() => null)
    if (cached) {
      const wav = new Uint8Array(cached.buffer, cached.byteOffset, cached.byteLength)
      const { samples, sampleRate } = decodeWav(wav)
      return { wav, duration: samples.length / sampleRate }
    }
    const audio = await say(voice, text)
    await mkdir(dir, { recursive: true })
    // Written beside it and moved into place, so a cut-off write is never read as the line.
    const partial = `${file}.${randomUUID()}.partial`
    await writeFile(partial, audio.wav)
    await rename(partial, file)
    return audio
  }

  function speak(voice: string, text: string): Promise<SpokenAudio> {
    const key = createHash('sha256').update(`${voice}\0${text}`).digest('hex')
    const running = speaking.get(key)
    if (running) return running
    const work = spoken(key, voice, text).finally(() => speaking.delete(key))
    speaking.set(key, work)
    return work
  }

  return {
    speak,
    async track(file) {
      const { voice, lines } = await readNarration(file)
      if (!voice || !lines.length) return undefined
      const audio = []
      for (const line of lines) {
        const { wav, duration } = await speak(voice, line.text)
        audio.push({ start: line.start, wav, duration })
      }
      const track = join(dir, `export-${randomUUID()}.wav`)
      await mkdir(dir, { recursive: true })
      await writeFile(track, mixNarration(audio)).catch(async (error: unknown) => {
        await rm(track, { force: true })
        throw error
      })
      return { file: track, end: narrationEnd(audio) }
    },
  }
}
