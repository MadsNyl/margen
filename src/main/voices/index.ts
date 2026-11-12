import { mkdir, rename, rm, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { SpokenAudio, VoicePack, VoicePackState } from '@shared/voices'
import type { CatalogueVoice, VoicePackEntry } from './catalogue'
import { downloadArchive, extractArchive } from './download'
import type { Synthesiser } from './synthesiser'
import { encodeWav } from './wav'

// The Voices on this Mac: what the catalogue offers, downloading and deleting
// it under `<dataDir>/voices/`, and speaking a line with an installed Voice.
// A pack is installed when its folder `voices/<pack id>/` exists; it's unpacked
// beside it in `voices/.downloads/` and moved into place in one rename.

export interface VoicesDeps {
  /** `<dataDir>/voices`. */
  dir: string
  catalogue: VoicePackEntry[]
  synthesiser: Synthesiser
  onChange: (packs: VoicePack[]) => void
  fetch?: typeof globalThis.fetch
  extract?: (archive: string, dest: string) => Promise<void>
}

export interface Voices {
  list(): Promise<VoicePack[]>
  /** Resolves once the pack is installed. Downloading one already downloading joins it. */
  download(pack: string): Promise<void>
  /** Rejects while the pack downloads. */
  delete(pack: string): Promise<void>
  /** Speaks `text` with an installed Voice (`kokoro/af_heart`). */
  speak(voice: string, text: string): Promise<SpokenAudio>
  /** Speaks the Voice's sample sentence. */
  preview(voice: string): Promise<SpokenAudio>
  dispose(): void
}

/** Progress is reported at most this often. */
const PROGRESS_MS = 100

export function createVoices({
  dir,
  catalogue,
  synthesiser,
  onChange,
  fetch = globalThis.fetch,
  extract = extractArchive,
}: VoicesDeps): Voices {
  const downloads = join(dir, '.downloads')
  /** Packs downloading or whose last download failed; the rest are installed or not, as `installed` says. */
  const states = new Map<string, Exclude<VoicePackState, { state: 'installed' | 'available' }>>()
  const running = new Map<string, Promise<void>>()
  const installedDir = (entry: VoicePackEntry) => join(dir, entry.id)
  /** The packs on disk, read once; downloads and deletes keep it current. */
  const installed = Promise.all(
    catalogue.map((entry) => stat(installedDir(entry)).then((s) => (s.isDirectory() ? entry.id : null), () => null)),
  ).then((ids) => new Set(ids.filter((id) => id !== null)))

  function entryFor(id: string): VoicePackEntry {
    const entry = catalogue.find((pack) => pack.id === id)
    if (!entry) throw new Error(`Not a Voice download: ${id}`)
    return entry
  }

  function voiceFor(id: string): { entry: VoicePackEntry; voice: CatalogueVoice } {
    for (const entry of catalogue) {
      const voice = entry.voices.find((v) => v.id === id)
      if (voice) return { entry, voice }
    }
    throw new Error(`Not a Voice: ${id}`)
  }

  async function speak(id: string, text: string): Promise<SpokenAudio> {
    const { entry, voice } = voiceFor(id)
    if (!(await installed).has(entry.id) || states.has(entry.id)) throw new Error(`The Voice ${id} is not on this Mac`)
    const files = (name: string) => join(installedDir(entry), name)
    const { samples, sampleRate } = await synthesiser.synthesise({
      engine: entry.engine,
      model: files(entry.files.model),
      tokens: files(entry.files.tokens),
      ...(entry.files.voices && { voices: files(entry.files.voices) }),
      speaker: voice.speaker,
      espeak: voice.espeak,
      text,
    })
    return { wav: encodeWav(samples, sampleRate), duration: samples.length / sampleRate }
  }

  function snapshot(on: Set<string>): VoicePack[] {
    return catalogue.map((entry) => ({
      id: entry.id,
      name: entry.name,
      engine: entry.engine,
      licence: entry.licence,
      size: entry.size,
      voices: entry.voices.map(({ id, name, language }) => ({ id, name, language })),
      state: states.get(entry.id) ?? (on.has(entry.id) ? { state: 'installed' } : { state: 'available' }),
    }))
  }

  const list = async () => snapshot(await installed)
  /** Called only once `installed` has been read, so events go out in order. */
  let changed = () => {}
  void installed.then((on) => (changed = () => onChange(snapshot(on))))

  async function install(entry: VoicePackEntry): Promise<void> {
    await mkdir(downloads, { recursive: true })
    const partial = join(downloads, `${entry.id}.tar.bz2.partial`)
    // At most one report per PROGRESS_MS; the latest count goes out at the end of the
    // window, so a download that stalls still shows how far it got.
    let reported = 0
    let latest = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const report = () => {
      timer = undefined
      reported = Date.now()
      states.set(entry.id, { state: 'downloading', received: latest })
      changed()
    }
    try {
      await downloadArchive({
        url: entry.url,
        file: partial,
        size: entry.size,
        sha256: entry.sha256,
        fetch,
        onProgress: (received) => {
          latest = received
          if (timer) return
          const wait = reported + PROGRESS_MS - Date.now()
          if (wait <= 0) report()
          else timer = setTimeout(report, wait)
        },
      })
    } finally {
      clearTimeout(timer)
    }
    const unpacked = join(downloads, entry.id)
    await rm(unpacked, { recursive: true, force: true })
    await mkdir(unpacked)
    try {
      await extract(partial, unpacked)
      await rename(join(unpacked, entry.folder), installedDir(entry))
    } finally {
      await rm(unpacked, { recursive: true, force: true })
    }
    await unlink(partial)
  }

  return {
    list,
    async download(id) {
      const entry = entryFor(id)
      const on = await installed
      const already = running.get(id)
      if (already) return already
      if (on.has(id)) return
      const run = (async () => {
        states.set(id, { state: 'downloading', received: 0 })
        changed()
        try {
          await install(entry)
          on.add(id)
          states.delete(id)
        } catch (error) {
          states.set(id, { state: 'failed', message: error instanceof Error ? error.message : String(error) })
          throw error
        } finally {
          running.delete(id)
          changed()
        }
      })()
      running.set(id, run)
      return run
    },
    async delete(id) {
      const entry = entryFor(id)
      if (running.has(id)) throw new Error('The Voice is still downloading')
      const on = await installed
      await rm(installedDir(entry), { recursive: true, force: true })
      await rm(join(downloads, `${entry.id}.tar.bz2.partial`), { force: true })
      on.delete(id)
      states.delete(id)
      changed()
    },
    speak,
    preview: async (id) => speak(id, voiceFor(id).voice.sample),
    dispose: () => synthesiser.dispose(),
  }
}
