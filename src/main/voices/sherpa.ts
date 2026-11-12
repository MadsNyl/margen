import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import type { Synthesised, Synthesiser, SynthesisRequest } from './synthesiser'

// The real synthesiser: sherpa-onnx (Apache-2.0) runs the Kokoro or Piper
// model; the text is phonemized first with piper-phonemize (espeak-ng,
// GPL-3.0), since sherpa-onnx 2 no longer carries espeak-ng itself. Both are
// native addons. In the app this runs in the Voices utility process
// (`src/main/voice-worker.ts`); the contract test runs it in plain Node.

interface OfflineTts {
  sampleRate: number
  generateAsync(request: { text: string; generationConfig: object; enableExternalBuffer: boolean }): Promise<Synthesised>
}

interface SherpaOnnx {
  OfflineTts: { createAsync(config: object): Promise<OfflineTts> }
  GenerationConfig: new (options: object) => object
}

interface PiperPhonemize {
  /** Starts espeak-ng with `<dir>/espeak-ng-data`; a negative result is a failure. */
  initialize(dir: string): number
  /** One list of phoneme code points per sentence, or null when it fails. */
  phonemize(text: string, voice: string): number[][] | null
}

/** Model threads per synthesis: enough to be quick, leaving the rest of the Mac alone. */
const THREADS = 2

/** Loads both addons, the first time a line is spoken. */
function loadAddons(): { sherpa: SherpaOnnx; phonemizer: PiperPhonemize } {
  const require = createRequire(import.meta.url)
  const sherpa = require('sherpa-onnx-node') as SherpaOnnx
  const phonemizer = require('piper-phonemize-node') as PiperPhonemize
  // espeak-ng reads its data from the package folder. In the packed app the package's
  // code is required from inside app.asar, but its files are only on disk unpacked.
  const espeakDir = dirname(require.resolve('piper-phonemize-node/package.json')).replace(/([/\\])app\.asar([/\\])/, '$1app.asar.unpacked$2')
  if (phonemizer.initialize(espeakDir) < 0) throw new Error(`espeak-ng-data is missing from ${espeakDir}`)
  return { sherpa, phonemizer }
}

export function createSherpaSynthesiser(): Synthesiser {
  let addons: ReturnType<typeof loadAddons> | undefined
  /** Loaded models, by model file; loading one takes a second or two. */
  const models = new Map<string, Promise<OfflineTts>>()

  function load({ sherpa }: ReturnType<typeof loadAddons>, request: SynthesisRequest): Promise<OfflineTts> {
    let model = models.get(request.model)
    if (!model) {
      const files = { model: request.model, tokens: request.tokens }
      const config = request.engine === 'kokoro' ? { kokoro: { ...files, voices: request.voices } } : { vits: files }
      model = sherpa.OfflineTts.createAsync({ model: { ...config, numThreads: THREADS, provider: 'cpu' }, maxNumSentences: 1 })
      model.catch(() => models.delete(request.model))
      models.set(request.model, model)
    }
    return model
  }

  return {
    async synthesise(request) {
      addons ??= loadAddons()
      const { sherpa, phonemizer } = addons
      const tts = await load(addons, request)
      // The C API refuses empty sentences, which a trailing punctuation mark gives.
      const phonemeCodepoints = (phonemizer.phonemize(request.text, request.espeak) ?? []).filter((s) => s.length > 0)
      if (!phonemeCodepoints.length) return { samples: new Float32Array(0), sampleRate: tts.sampleRate }
      const generationConfig = new sherpa.GenerationConfig({ phonemeCodepoints, sid: request.speaker, speed: 1 })
      // Electron's V8 memory cage refuses the addon's external buffers, so the samples are copied.
      const { samples, sampleRate } = await tts.generateAsync({ text: '', generationConfig, enableExternalBuffer: false })
      return { samples, sampleRate }
    },
    dispose() {
      models.clear()
    },
  }
}
