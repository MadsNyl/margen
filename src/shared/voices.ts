// Voices: open-source speech models the user downloads into Margen and that
// run on their own Mac. One download (a Voice pack) can hold several Voices:
// Kokoro-82M is one download with many speakers, each Piper voice is its own.

/**
 * One Voice, as a video chooses it. `id` is what `<meta name="margen-voice">`
 * holds: `kokoro/af_heart`, `piper/no_NO-talesyntese-medium`.
 */
export interface Voice {
  id: string
  name: string
  /** In English: `English (US)`, `Norwegian`. */
  language: string
}

export type VoicePackState =
  | { state: 'available' }
  | { state: 'downloading'; received: number }
  | { state: 'installed' }
  | { state: 'failed'; message: string }

/** One download in Settings → Voices. */
export interface VoicePack {
  id: string
  name: string
  engine: 'kokoro' | 'piper'
  /** The engine's and the voice data's licences, as Settings shows them. */
  licence: string
  /** The download's size in bytes. */
  size: number
  voices: Voice[]
  state: VoicePackState
}

/** A line spoken with a Voice: a mono 16-bit PCM WAV file, and its length. */
export interface SpokenAudio {
  wav: Uint8Array
  /** In seconds. */
  duration: number
}
