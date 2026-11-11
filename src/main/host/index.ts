import type { HostApi, HostCallName, HostCalls, HostEventName, HostEvents } from '@shared/host-api'
import type { AgentProvider } from '../agent/provider'
import { readRecents, writeRecents } from '../projects/recents'
import { createUpdater, type UpdateSource } from '../updates'
import { createEmitter } from './emitter'

export interface HostDeps {
  /** Margen's own data directory (Electron's userData in the app, a temp folder in tests). */
  dataDir: string
  agent: AgentProvider
  /** The release feed for auto-update; left out in dev builds and tests. */
  updates?: UpdateSource
}

export interface Host extends HostApi {
  dispose(): void
}

type Handlers = { [K in HostCallName]: (...args: Parameters<HostCalls[K]>) => Promise<Awaited<ReturnType<HostCalls[K]>>> }

export function createHost({ dataDir, agent, updates }: HostDeps): Host {
  const events = createEmitter<HostEvents>()
  const updater = createUpdater(updates, (status) => events.emit('update.changed', status))

  const handlers: Handlers = {
    'agent.detect': () => agent.detect(),
    'agent.install': () => agent.install(),
    'agent.signIn': () => agent.signIn(),
    'recents.list': () => readRecents(dataDir),
    'recents.clear': async () => {
      await writeRecents(dataDir, [])
      events.emit('recents.changed', [])
    },
    'update.status': async () => updater.status(),
    'update.check': () => updater.check(),
    'update.install': async () => updater.install(),
  }

  return {
    call(name, ...args) {
      if (!Object.hasOwn(handlers, name)) return Promise.reject(new Error(`Unknown host call: ${String(name)}`))
      const handler = handlers[name] as (...a: unknown[]) => Promise<never>
      return handler(...args)
    },
    on<K extends HostEventName>(event: K, listener: (payload: HostEvents[K]) => void) {
      return events.on(event, listener)
    },
    dispose() {
      events.clear()
    },
  }
}
