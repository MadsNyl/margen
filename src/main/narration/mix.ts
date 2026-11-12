import { decodeWav, encodeWav } from '../voices/wav'

// The export's narration track: every line's audio in one WAV, each placed at
// its start, silent before and between. The bundled ffmpeg has no `amix` or
// `adelay`, so the mixing is done here; the export pads or cuts it to the video.

/** The rate of a mix with no lines. */
const SILENT_RATE = 22050

export function mixNarration(lines: readonly { start: number; wav: Uint8Array }[]): Uint8Array {
  const decoded = lines.map((line) => ({ start: line.start, ...decodeWav(line.wav) }))
  const sampleRate = decoded[0]?.sampleRate ?? SILENT_RATE
  if (decoded.some((line) => line.sampleRate !== sampleRate)) throw new Error('The narration lines are spoken at different sample rates')
  const at = (line: (typeof decoded)[number]) => Math.round(line.start * sampleRate)
  const length = Math.max(0, ...decoded.map((line) => at(line) + line.samples.length))
  const mix = new Float32Array(length)
  for (const line of decoded) {
    const from = at(line)
    mix.set(line.samples.map((sample, i) => sample + (mix[from + i] ?? 0)), from)
  }
  // encodeWav keeps samples within full scale.
  return encodeWav(mix, sampleRate)
}
