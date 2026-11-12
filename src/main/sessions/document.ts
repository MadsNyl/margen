import { randomUUID } from 'node:crypto'
import type { QueueView, SessionEntry, SessionSummary } from '@shared/host-api'
import type { AgentProvider } from '../agent/provider'
import type { PermissionPolicy } from '../permissions'
import { startDocumentSession, type DocumentSession, type DocumentSessionOptions } from '.'
import type { SessionStore, StoredSession } from './store'

// One Document's Sessions: the active one, which the chat shows, and the past
// ones in the store. The active Session is saved when a message is sent, when
// a Turn ends and when it's put away, so it survives quitting Margen. A Session
// is only stored once it has had a Turn, so New session on an empty one keeps it.

export interface DocumentSessions {
  current(): DocumentSession
  /** Puts the active Session away and starts an empty one, unless it's empty already. */
  startNew(): DocumentSession
  /** Makes a stored Session of this Document the active one. */
  resume(id: string): DocumentSession
  list(): SessionSummary[]
  /** Saves and stops the active Session. */
  dispose(): void
}

export interface DocumentSessionsOptions {
  store: SessionStore
  agent: AgentProvider
  projectDir: string
  document: string
  permissions: PermissionPolicy
  /** The Template's instructions for each Session as it starts: see `DocumentSessionOptions`. */
  instructions?: DocumentSessionOptions['instructions']
  /** Takes the Checkpoint before each Turn: see `DocumentSessionOptions`. */
  beforeTurn?: DocumentSessionOptions['beforeTurn']
  onEntry(session: string, entry: SessionEntry, index: number): void
  /** The active Session's Queue changed. */
  onQueue(queue: QueueView): void
  /** The active Session was replaced by `startNew` or `resume`. */
  onChanged(session: DocumentSession): void
}

export function documentSessions({
  store,
  document,
  onEntry,
  onChanged,
  ...start
}: DocumentSessionsOptions): DocumentSessions {
  let meta: StoredSession
  let session: DocumentSession

  function open(from: StoredSession, entries: SessionEntry[]) {
    meta = { ...from }
    session = startDocumentSession({
      ...start,
      document,
      id: from.id,
      number: from.number,
      entries,
      ...(from.agentSessionId && { resumeId: from.agentSessionId }),
      onEntry: (entry, index) => {
        if (entry.type === 'user') {
          meta.turns += 1
          if (meta.turns === 1) meta = { ...meta, startedAt: new Date().toISOString(), firstMessage: entry.turn.text }
        }
        if (entry.type === 'user' || entry.type === 'turn-end' || !meta.agentSessionId) save()
        onEntry(from.id, entry, index)
      },
    })
  }

  function save() {
    if (meta.turns === 0) return
    const agentSessionId = session.agentSessionId() ?? meta.agentSessionId
    meta = { ...meta, ...(agentSessionId && { agentSessionId }) }
    store.save(meta, session.view().entries)
  }

  function putAway() {
    session.dispose()
    if (meta.turns > 0) store.save(meta, settled(session.view().entries))
  }

  function fresh(): StoredSession {
    const number = Math.max(0, ...store.list(document).map((stored) => stored.number)) + 1
    return { id: randomUUID(), document, number, startedAt: '', turns: 0, firstMessage: '' }
  }

  const active = store.active(document)
  if (active) open(active, settled(store.entries(active.id)))
  else open(fresh(), [])

  return {
    current: () => session,
    startNew() {
      if (meta.turns === 0) return session
      putAway()
      store.clearActive(document)
      open(fresh(), [])
      onChanged(session)
      return session
    },
    resume(id) {
      const stored = store.get(id)
      if (!stored || stored.document !== document) throw new Error(`No such Session for ${document}: ${id}`)
      if (stored.id === meta.id) return session
      putAway()
      open(stored, settled(store.entries(id)))
      save()
      onChanged(session)
      return session
    },
    list: () =>
      store.list(document).map(({ id, number, startedAt, turns, firstMessage }) => ({
        id,
        number,
        startedAt,
        turns,
        firstMessage,
        active: id === meta.id,
      })),
    dispose: putAway,
  }
}

/** A Turn that was still running when its Session was put away ended there. */
function settled(entries: SessionEntry[]): SessionEntry[] {
  const lastUser = entries.findLastIndex((entry) => entry.type === 'user')
  const ended = lastUser === -1 || entries.slice(lastUser).some((entry) => entry.type === 'turn-end')
  return ended ? entries : [...entries, { type: 'turn-end', reason: 'interrupted' }]
}
