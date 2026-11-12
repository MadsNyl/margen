import { utilityProcess, type UtilityProcess } from 'electron'
import type { Synthesised, Synthesiser, SynthesisRequest } from './voices/synthesiser'

// The Electron adapter for Voices: synthesis runs in a utility process
// (`voice-worker.ts`), started on the first line spoken and again after it exits.

type Reply = { id: number } & ({ samples: Float32Array; sampleRate: number } | { error: string })

export function createUtilityProcessSynthesiser(workerPath: string): Synthesiser {
  let worker: UtilityProcess | undefined
  let nextId = 0
  const pending = new Map<number, { resolve: (audio: Synthesised) => void; reject: (error: Error) => void }>()

  function start(): UtilityProcess {
    const child = utilityProcess.fork(workerPath, [], { serviceName: 'Margen Voices', stdio: 'inherit' })
    child.on('message', (reply: Reply) => {
      const call = pending.get(reply.id)
      pending.delete(reply.id)
      if (!call) return
      if ('error' in reply) call.reject(new Error(reply.error))
      else call.resolve({ samples: reply.samples, sampleRate: reply.sampleRate })
    })
    child.on('exit', (code) => {
      if (worker === child) worker = undefined
      for (const call of pending.values()) call.reject(new Error(`The Voice stopped unexpectedly (exit ${code})`))
      pending.clear()
    })
    return child
  }

  return {
    synthesise(request: SynthesisRequest) {
      worker ??= start()
      const id = nextId++
      const done = new Promise<Synthesised>((resolve, reject) => pending.set(id, { resolve, reject }))
      worker.postMessage({ id, request })
      return done
    },
    dispose() {
      worker?.kill()
      worker = undefined
    },
  }
}
