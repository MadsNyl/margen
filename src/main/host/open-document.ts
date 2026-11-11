import { join } from 'node:path'
import type { HostEventName, HostEvents, OpenDocument, PermissionPreset, Project } from '@shared/host-api'
import type { AgentProvider } from '../agent/provider'
import type { CheckpointStore } from '../checkpoints'
import { presetPolicy } from '../permissions'
import { documentUrl, watchDocument } from '../projects/document'
import type { DocumentSession } from '../sessions'
import { documentSessions, type DocumentSessions } from '../sessions/document'
import { openSessionStore } from '../sessions/store'

// The Document open in the editor: its margen-doc:// URL and reload watch,
// and its Sessions, wired to the host's events, with a Checkpoint taken before
// every Turn. `createHost` holds at most one and closes it before the next.

export interface EditorDocument {
  /** What `document.open` and `document.current` give the renderer. */
  info: OpenDocument
  /** The Document's file, absolute. */
  file: string
  /** The active Session; New session and resume replace it. */
  session(): DocumentSession
  sessions: DocumentSessions
  /** Stops the reload watch and puts the active Session away. */
  close(): void
}

export interface EditorDocumentOptions {
  dataDir: string
  agent: AgentProvider
  project: Project
  /** The Document, relative to the Project with `/` separators, and its file name. */
  path: string
  name: string
  /** The open Project's Checkpoints, or `null` once it's closed: no Checkpoint is taken then. */
  checkpoints(): CheckpointStore | null
  preset(): Promise<PermissionPreset>
  emit<K extends HostEventName>(event: K, payload: HostEvents[K]): void
}

export function openEditorDocument({ dataDir, agent, project, path, name, checkpoints, preset, emit }: EditorDocumentOptions): EditorDocument {
  const stopWatching = watchDocument(project.path, path, () => emit('document.updated', { path }))
  const sessions: DocumentSessions = documentSessions({
    store: openSessionStore(dataDir, project.path),
    agent,
    projectDir: project.path,
    document: path,
    permissions: presetPolicy(project.path, preset),
    beforeTurn: async (turn) => {
      const store = checkpoints()
      if (!store) return undefined
      const number = sessions.current().view().number
      const checkpoint = await store.take({ reason: 'turn', document: path, ...(number && { session: number }), text: turn.text })
      if (store === checkpoints()) emit('checkpoints.changed', await store.list())
      return checkpoint.id
    },
    onEntry: (id, entry, index) => emit('session.entry', { document: path, session: id, index, entry }),
    onQueue: (queue) => emit('session.queue', queue),
    onChanged: (next) => {
      emit('session.changed', next.view())
      emit('session.queue', next.queue())
    },
  })

  return {
    info: { path, name, url: documentUrl(project.path, path) },
    file: join(project.path, path),
    session: () => sessions.current(),
    sessions,
    close() {
      stopWatching()
      sessions.dispose()
    },
  }
}
