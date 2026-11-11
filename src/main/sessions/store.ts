import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SessionEntry } from '@shared/host-api'
import { projectId } from '../projects/document'

// A Project's Sessions, in Margen's data directory under
// `sessions/<project id>/`: `index.json` lists every Session of every Document
// (with its Agent session id, for resume) and which one is each Document's
// active Session; `<session id>.json` holds one Session's entries. Writes are
// synchronous, so a Session saved while quitting is on disk before the app exits.

export interface StoredSession {
  id: string
  /** Relative to the Project folder, as in `OpenDocument.path`. */
  document: string
  number: number
  startedAt: string
  /** The Agent's own session id, once a Turn has started it. */
  agentSessionId?: string
  turns: number
  firstMessage: string
}

interface Index {
  project: string
  /** Document → its active Session's id. */
  active: Record<string, string>
  sessions: StoredSession[]
}

export interface SessionStore {
  /** A Document's stored Sessions, newest first. */
  list(document: string): StoredSession[]
  get(id: string): StoredSession | undefined
  /** The Document's active Session, if it's stored. */
  active(document: string): StoredSession | undefined
  entries(id: string): SessionEntry[]
  /** Stores a Session and its entries, and makes it its Document's active Session. */
  save(session: StoredSession, entries: SessionEntry[]): void
  /** The Document's active Session is a new one, not stored yet. */
  clearActive(document: string): void
}

export function openSessionStore(dataDir: string, projectDir: string): SessionStore {
  const dir = join(dataDir, 'sessions', projectId(projectDir))
  const indexFile = join(dir, 'index.json')
  const entriesFile = (id: string) => join(dir, `${id}.json`)

  function readJson<T>(file: string, fallback: T): T {
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as T
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
      throw error
    }
  }

  const index = readJson<Index>(indexFile, { project: projectDir, active: {}, sessions: [] })

  function writeIndex() {
    mkdirSync(dir, { recursive: true })
    writeFileSync(indexFile, JSON.stringify(index, null, 2))
  }

  const get = (id: string) => index.sessions.find((session) => session.id === id)

  return {
    list: (document) =>
      index.sessions.filter((session) => session.document === document).sort((a, b) => b.number - a.number),
    get,
    active(document) {
      const id = index.active[document]
      return id === undefined ? undefined : get(id)
    },
    entries: (id) => readJson<SessionEntry[]>(entriesFile(id), []),
    save(session, entries) {
      mkdirSync(dir, { recursive: true })
      writeFileSync(entriesFile(session.id), JSON.stringify(entries))
      index.sessions = [...index.sessions.filter((stored) => stored.id !== session.id), session]
      index.active[session.document] = session.id
      writeIndex()
    },
    clearActive(document) {
      if (!(document in index.active)) return
      delete index.active[document]
      writeIndex()
    },
  }
}
