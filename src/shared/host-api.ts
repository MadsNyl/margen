// The host API: the only bridge between the renderer and the main process.
// The renderer reaches it as `window.margen`; Seam 1 tests call it directly
// via `createHost`. Add new calls to `HostCalls` and new events to
// `HostEvents`; the IPC wiring and the preload pick them up by name.

import type { AgentSetupResult, AgentStatus } from './agent'

/** A folder opened in Margen. `path` is absolute; `name` is the folder's name. */
export interface Project {
  path: string
  name: string
}

export interface RecentProject extends Project {
  openedAt: string
  /** How many Documents the folder holds right now. 0 when it's missing. */
  htmlFiles: number
  /** The folder was moved or deleted since it was last opened. */
  missing: boolean
}

/** One HTML file in the open Project. */
export interface DocumentInfo {
  /** Relative to the Project folder, with `/` separators: `campaigns/christmas.html`. */
  path: string
  name: string
  /** The subfolder, with a trailing `/`, or `''` at the top level. */
  dir: string
  modifiedAt: string
}

export interface DocumentList {
  documents: DocumentInfo[]
  /** Ignored folders (node_modules, .git, build output) that the Project contains. */
  hidden: string[]
}

/** Where auto-update stands. `unavailable` in dev builds and tests, which have no release feed. */
export type UpdateStatus =
  | { state: 'unavailable' }
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date' }
  | { state: 'downloading'; version: string }
  | { state: 'ready'; version: string }
  | { state: 'failed'; message: string }

export interface HostCalls {
  'agent.detect': () => AgentStatus
  /** Runs the Agent's official installer. Resolves when it has finished. */
  'agent.install': () => AgentSetupResult
  /** Opens the Agent's own login in Terminal. Resolves once the Agent reports signed in, or gives up. */
  'agent.signIn': () => AgentSetupResult
  /** Shows the folder picker and opens the chosen folder. `null` if the user cancels. */
  'projects.choose': () => Project | null
  /** Opens a folder as the current Project. Rejects if it isn't there. */
  'projects.open': (path: string) => Project
  'projects.current': () => Project | null
  /** Goes back to the Start screen: no Project is open. */
  'projects.close': () => void
  /** The Documents of the current Project. */
  'documents.list': () => DocumentList
  'recents.list': () => RecentProject[]
  'recents.clear': () => void
  'update.status': () => UpdateStatus
  /** Checks GitHub Releases and downloads a newer version if there is one. */
  'update.check': () => UpdateStatus
  /** Restarts into the downloaded version. */
  'update.install': () => void
}

export interface HostEvents {
  'projects.changed': Project | null
  'recents.changed': RecentProject[]
  'update.changed': UpdateStatus
  /** The current Project's Documents, whenever files change on disk. */
  'documents.changed': DocumentList
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
