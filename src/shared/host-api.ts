// The host API: the only bridge between the renderer and the main process.
// The renderer reaches it as `window.margen`; Seam 1 tests call it directly
// via `createHost`. Add new calls to `HostCalls` and new events to
// `HostEvents`; the IPC wiring and the preload pick them up by name.

import type { AgentEvent, AgentSetupResult, AgentStatus, ApprovalDecision, TurnInput } from './agent'

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

/** The Document open in the editor. */
export interface OpenDocument {
  /** Relative to the Project folder, with `/` separators, as in `DocumentInfo`. */
  path: string
  name: string
  /**
   * Where the Document view loads it: `margen-doc://<project id>/<path>`. The id is
   * stable per Project folder, so the page keeps one origin (and its localStorage).
   */
  url: string
}

/**
 * One thing in a Session's conversation: what the user sent, how they answered an approval-request, or something the Agent did.
 * A user entry names the Checkpoint taken just before its Turn, when there is one.
 */
export type SessionEntry =
  | { type: 'user'; turn: TurnInput; checkpoint?: string }
  | { type: 'approval-answer'; id: string; decision: ApprovalDecision }
  | AgentEvent

/** A snapshot of the whole Project, taken before a Turn or before a revert. */
export interface Checkpoint {
  /** What `checkpoints.revert` takes. */
  id: string
  /** 1, 2, 3… in the order the Project's Checkpoints were taken. */
  number: number
  takenAt: string
  /** `turn`: just before a Turn. `revert`: just before a revert, so the revert can be undone. */
  reason: 'turn' | 'revert'
  /** For `turn`: the Document and the number of the Session the Turn was in, and what the user wrote. */
  document?: string
  session?: number
  text?: string
}

/** The open Document's Session, as the chat shows it. */
export interface SessionView {
  /** The Document it belongs to, as in `OpenDocument.path`. */
  document: string
  /** Margen's own id for the Session (not the Agent's). */
  id: string
  /** Counts up per Document: "Session 2". */
  number: number
  entries: SessionEntry[]
}

/**
 * How much the Agent may do without asking. `editor`: read the Project, write inside it
 * and use the web; shell commands and paths outside the Project ask. `allow-everything`: never asks.
 */
export type PermissionPreset = 'editor' | 'allow-everything'

/** A message waiting in the Queue to go out as its own Turn. */
export interface QueuedMessage {
  id: string
  turn: TurnInput
}

/** The open Document's Queue, in the order it sends. */
export interface QueueView {
  document: string
  messages: QueuedMessage[]
  /** After an interrupt the Queue waits: nothing sends until the user sends again. */
  held: boolean
}

/** One of a Document's Sessions, as the history drawer lists it. */
export interface SessionSummary {
  id: string
  number: number
  /** When its first Turn was sent. */
  startedAt: string
  turns: number
  /** The text of its first message. */
  firstMessage: string
  /** It's the Document's active Session, the one in the chat. */
  active: boolean
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
  /** Makes an empty folder for a new Project under `~/Documents/Margen/` and opens it. */
  'projects.create': (name: string) => Project
  'projects.current': () => Project | null
  /** Goes back to the Start screen: no Project is open. */
  'projects.close': () => void
  /** The Documents of the current Project. */
  'documents.list': () => DocumentList
  /** Opens a Document of the current Project in the editor. Rejects for anything else. */
  'document.open': (path: string) => OpenDocument
  'document.current': () => OpenDocument | null
  /** Back to the Project page: no Document is open. */
  'document.close': () => void
  /** Opens the open Document's file in the default browser. */
  'document.openInBrowser': () => void
  /** A screenshot of the Document view as it is shown, a PNG data URL in device pixels (2× on Retina). `null` if it can't be taken. */
  'document.capture': () => string | null
  /** The open Document's Session, or `null` when no Document is open. */
  'session.current': () => SessionView | null
  /**
   * Starts a Turn in the open Document's Session, or queues it while a Turn runs. Sending
   * while the Queue is held releases it: the new message goes last. Rejects when no Document is open.
   */
  'session.send': (turn: TurnInput) => void
  /** A Turn is running in the open Document's Session, or its Queue is about to start one. The editor asks before switching away. */
  'session.running': () => boolean
  /** The open Document's Queue, or `null` when no Document is open. */
  'session.queue': () => QueueView | null
  /** Takes a message out of the Queue before it sends. */
  'session.unqueue': (id: string) => void
  /** Stops the running Turn (it ends with turn-end "interrupted") and holds the Queue. */
  'session.interrupt': () => void
  'session.answerApproval': (id: string, decision: ApprovalDecision) => void
  /** The permission preset every tool request goes through. */
  'permissions.preset': () => PermissionPreset
  /** Switches the preset and keeps it; it applies from the next tool request, also in a running Turn. */
  'permissions.setPreset': (preset: PermissionPreset) => PermissionPreset
  /** Puts the active Session away and starts an empty one. An empty Session stays as it is. */
  'session.new': () => SessionView
  /** Makes one of the open Document's past Sessions the active one; its Agent session continues. */
  'session.resume': (id: string) => SessionView
  /** The open Document's Sessions that have had a Turn, newest first. */
  'sessions.list': () => SessionSummary[]
  /** The current Project's Checkpoints from every Session, newest first. */
  'checkpoints.list': () => Checkpoint[]
  /**
   * Restores every file of the current Project to a Checkpoint, deleting files made since.
   * Takes a `revert` Checkpoint first. Rejects while a Turn runs or the Queue is about to start one.
   */
  'checkpoints.revert': (id: string) => void
  /**
   * The Project page's chat bar. Opens the Document the message `@`-mentions, or
   * makes a new one named from it, and starts that Document's Session with the message.
   */
  'project.send': (text: string) => OpenDocument
  'recents.list': () => RecentProject[]
  'recents.clear': () => void
  /** The running app's version, for Settings' About. */
  'app.version': () => string
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
  /** The Document open in the editor, or `null` when none is. */
  'document.opened': OpenDocument | null
  /**
   * The open Document, or a file it may load (CSS, images, scripts), changed on disk.
   * Debounced: several writes close together send one event. The view reloads on it.
   */
  'document.updated': { path: string }
  /** A link in the Document view leads to another Document of the Project; the editor opens it (asking first while a Turn runs). */
  'document.link': { path: string }
  /** A new entry in the open Document's Session; `index` is its place in `SessionView.entries`. */
  'session.entry': { document: string; session: string; index: number; entry: SessionEntry }
  /** The open Document's active Session was replaced (New session, resume). */
  'session.changed': SessionView
  /** The current Project's Checkpoints, newest first, whenever one is taken. */
  'checkpoints.changed': Checkpoint[]
  'permissions.changed': PermissionPreset
  /** The open Document's Queue changed: a message was queued, removed or sent, or it was held or released. */
  'session.queue': QueueView
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
