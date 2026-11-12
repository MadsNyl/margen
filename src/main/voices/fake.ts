import { appendFileSync, readFileSync } from 'node:fs'
import type { VoicePackEntry } from './catalogue'
import type { Synthesiser, SynthesisRequest } from './synthesiser'

// A stand-in synthesiser for Seam 1 and Seam 2 tests: a quiet tone a tenth of
// a second per word at 22050 Hz, and with `spokenFile` each request appended to
// it as a JSON line, so a test can see what was spoken. Seam 2 passes a
// `FakeVoicesScript` file as `MARGEN_FAKE_VOICES`: its own catalogue (served
// by the test) and the fake synthesiser.

const SAMPLE_RATE = 22050

export function createFakeSynthesiser(opts: { spokenFile?: string } = {}): Synthesiser & { spoken: SynthesisRequest[] } {
  const spoken: SynthesisRequest[] = []
  return {
    spoken,
    async synthesise(request) {
      spoken.push(request)
      if (opts.spokenFile) appendFileSync(opts.spokenFile, `${JSON.stringify(request)}\n`)
      const words = request.text.split(/\s+/).filter(Boolean).length
      const samples = new Float32Array(Math.round(words * 0.1 * SAMPLE_RATE))
      for (let i = 0; i < samples.length; i++) samples[i] = 0.1 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE)
      return { samples, sampleRate: SAMPLE_RATE }
    },
    dispose() {},
  }
}

export interface FakeVoicesScript {
  catalogue: VoicePackEntry[]
  spokenFile?: string
}

export function fakeVoicesFromScript(file: string): { catalogue: VoicePackEntry[]; synthesiser: Synthesiser } {
  const script = JSON.parse(readFileSync(file, 'utf8')) as FakeVoicesScript
  return { catalogue: script.catalogue, synthesiser: createFakeSynthesiser({ spokenFile: script.spokenFile }) }
}
