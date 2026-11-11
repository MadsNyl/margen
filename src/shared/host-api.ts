// The host API: the only bridge between the renderer and the main process.
// The renderer reaches it as `window.margen`; Seam 1 tests call it directly
// via `createHost`. Add new calls to `HostCalls` and new events to
// `HostEvents`; the IPC wiring and the preload pick them up by name.

import type { AgentStatus } from './agent'

export interface RecentProject {
  path: string
  name: string
  openedAt: string
}

export interface HostCalls {
  'agent.detect': () => AgentStatus
  'recents.list': () => RecentProject[]
  'recents.clear': () => void
}

export interface HostEvents {
  'recents.changed': RecentProject[]
}

export type HostCallName = keyof HostCalls
export type HostCallArgs<K extends HostCallName> = Parameters<HostCalls[K]>
export type HostCallResult<K extends HostCallName> = Awaited<ReturnType<HostCalls[K]>>
export type HostEventName = keyof HostEvents

export interface HostApi {
  call<K extends HostCallName>(name: K, ...args: HostCallArgs<K>): Promise<HostCallResult<K>>
  on<K extends HostEventName>(event: K, listener: (payload: HostEvents[K]) => void): () => void
}

/** IPC channel names used by the preload and `src/main/ipc.ts`. */
export const HOST_CALL_CHANNEL = 'margen:call'
export const HOST_EVENT_CHANNEL = 'margen:event'
