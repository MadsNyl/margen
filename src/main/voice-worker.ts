import type { SynthesisRequest } from './voices/synthesiser'
import { createSherpaSynthesiser } from './voices/sherpa'

// The Voices utility process: sherpa-onnx's native addon runs here, off the
// main process, so a slow or crashing synthesis never stalls the app. It
// answers `{ id, request }` with `{ id, samples, sampleRate }` or `{ id, error }`.

const synthesiser = createSherpaSynthesiser()

process.parentPort.on('message', ({ data }: { data: { id: number; request: SynthesisRequest } }) => {
  synthesiser.synthesise(data.request).then(
    ({ samples, sampleRate }) => process.parentPort.postMessage({ id: data.id, samples, sampleRate }),
    (error: unknown) => process.parentPort.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) }),
  )
})
