/** Mono samples in [-1, 1] as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const wav = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(wav.buffer)
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) wav[at + i] = value.charCodeAt(i)
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // bytes per second
  view.setUint16(32, 2, true) // bytes per frame
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 0x7fff), true))
  return wav
}

/** A mono 16-bit PCM WAV file (as `encodeWav` writes it) as samples in [-1, 1]. */
export function decodeWav(wav: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const text = (at: number) => String.fromCharCode(...wav.subarray(at, at + 4))
  if (wav.length < 12 || text(0) !== 'RIFF' || text(8) !== 'WAVE') throw new Error('Not a WAV file')
  let sampleRate: number | undefined
  for (let at = 12; at + 8 <= wav.length; ) {
    const size = view.getUint32(at + 4, true)
    const body = at + 8
    if (text(at) === 'fmt ') {
      if (view.getUint16(body, true) !== 1 || view.getUint16(body + 2, true) !== 1 || view.getUint16(body + 14, true) !== 16) {
        throw new Error('Only mono 16-bit PCM WAV files are read')
      }
      sampleRate = view.getUint32(body + 4, true)
    } else if (text(at) === 'data') {
      if (sampleRate === undefined) break
      const count = Math.floor(Math.min(size, wav.length - body) / 2)
      const samples = new Float32Array(count)
      for (let i = 0; i < count; i++) samples[i] = view.getInt16(body + i * 2, true) / 0x7fff
      return { samples, sampleRate }
    }
    at = body + size + (size % 2)
  }
  throw new Error('Not a WAV file')
}
