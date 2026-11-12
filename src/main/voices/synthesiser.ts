// What speaks a line: sherpa-onnx in an Electron utility process in the app
// (`src/main/voice-process.ts`), a fake in tests.

export interface SynthesisRequest {
  engine: 'kokoro' | 'piper'
  /** Absolute paths to the installed model's files. `voices` is Kokoro's speaker embeddings. */
  model: string
  tokens: string
  voices?: string
  /** The speaker id within the model (0 for single-speaker Piper voices). */
  speaker: number
  /** The espeak-ng voice the text is phonemized with: `en-us`, `nb`. */
  espeak: string
  text: string
}

export interface Synthesised {
  /** Mono samples in [-1, 1]. */
  samples: Float32Array
  sampleRate: number
}

export interface Synthesiser {
  synthesise(request: SynthesisRequest): Promise<Synthesised>
  dispose(): void
}
