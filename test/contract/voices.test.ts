import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { createVoices } from '../../src/main/voices'
import { VOICE_CATALOGUE } from '../../src/main/voices/catalogue'
import { createSherpaSynthesiser } from '../../src/main/voices/sherpa'

// The Voices contract test: downloads one real Piper voice (Norwegian, 67 MB)
// from sherpa-onnx's releases and speaks a line with the real sherpa-onnx and
// piper-phonemize addons. It downloads a lot, so it only runs when asked:
//   MARGEN_VOICE_CONTRACT=1 pnpm vitest run test/contract/voices.test.ts
// The voice is kept in the temp folder (margen-voice-contract) for the next run.
// MARGEN_VOICE_CONTRACT_PACK picks another pack from the catalogue.

const enabled = process.env.MARGEN_VOICE_CONTRACT === '1'
const packId = process.env.MARGEN_VOICE_CONTRACT_PACK ?? 'piper-no_NO-talesyntese-medium'

test.skipIf(!enabled)(
  'a real Voice downloads, checks out against its sha256 and speaks a line through sherpa-onnx',
  async () => {
    const dir = join(tmpdir(), 'margen-voice-contract')
    await mkdir(dir, { recursive: true })
    const synthesiser = createSherpaSynthesiser()
    const voices = createVoices({ dir, catalogue: VOICE_CATALOGUE, synthesiser, onChange: () => {} })
    try {
      await voices.download(packId)
      const pack = (await voices.list()).find((p) => p.id === packId)
      expect(pack?.state).toEqual({ state: 'installed' })

      const voice = VOICE_CATALOGUE.find((p) => p.id === packId)?.voices[0]
      if (!voice) throw new Error(`No Voice in ${packId}`)
      const audio = await voices.preview(voice.id)
      // A short sentence: a second or more of speech, and not much more than ten.
      expect(audio.duration).toBeGreaterThan(1)
      expect(audio.duration).toBeLessThan(10)
      expect(String.fromCharCode(...audio.wav.subarray(0, 4))).toBe('RIFF')
      const samples = new Int16Array(audio.wav.buffer, audio.wav.byteOffset + 44, (audio.wav.length - 44) / 2)
      expect(samples.some((s) => Math.abs(s) > 1000)).toBe(true)

      // A longer line takes longer to say.
      const longer = await voices.speak(voice.id, `${voice.sample} `.repeat(3))
      expect(longer.duration).toBeGreaterThan(audio.duration * 2)
    } finally {
      voices.dispose()
    }
  },
  10 * 60_000,
)
