import type { ApprovalDecision, TurnInput } from '@shared/agent'
import type { SessionEntry, SessionView } from '@shared/host-api'
import type { AgentProvider, AgentSession } from '../agent/provider'
import type { PermissionPolicy } from '../permissions'

// The open Document's Session: its entries, and the Agent session behind it,
// started on the first Turn. `documentSessions` (./document.ts) stores them per
// Document and switches between them.

export interface DocumentSession {
  view(): SessionView
  /** The Agent's session id, once a Turn has started it. */
  agentSessionId(): string | undefined
  /** Resolves once the Turn has reached the Agent, after `beforeTurn`. */
  send(turn: TurnInput): Promise<void>
  /** A Turn is running. */
  running(): boolean
  answerApproval(id: string, decision: ApprovalDecision): void
  interrupt(): Promise<void>
  /** Stops the Agent and sends no more entries. */
  dispose(): void
}

export interface DocumentSessionOptions {
  agent: AgentProvider
  projectDir: string
  /** The Document, relative to the Project folder. */
  document: string
  /** Margen's id for the Session, and its number among the Document's Sessions. */
  id: string
  number: number
  /** What the Session already holds, when it's a stored one. */
  entries?: SessionEntry[]
  permissions: PermissionPolicy
  /** Resumes this Agent session instead of starting a new one. */
  resumeId?: string
  /** Runs before each Turn reaches the Agent: takes its Checkpoint and resolves with the id, or `undefined` if none was taken. */
  beforeTurn?(turn: TurnInput): Promise<string | undefined>
  onEntry(entry: SessionEntry, index: number): void
}

export function startDocumentSession({
  agent,
  projectDir,
  document,
  id,
  number,
  entries: stored = [],
  permissions,
  resumeId,
  beforeTurn = async () => undefined,
  onEntry,
}: DocumentSessionOptions): DocumentSession {
  const entries: SessionEntry[] = [...stored]
  let session: AgentSession | undefined
  let running = false
  let disposed = false

  function add(entry: SessionEntry) {
    if (disposed) return
    entries.push(entry)
    onEntry(entry, entries.length - 1)
  }

  async function pump(from: AgentSession) {
    for await (const event of from.events) {
      if (disposed) return
      if (event.type === 'turn-end') running = false
      add(event)
    }
  }

  function agentSession(): AgentSession {
    if (!session) {
      session = agent.startSession({ projectDir, permissions, ...(resumeId && { resumeId }) })
      void pump(session)
    }
    return session
  }

  return {
    view: () => ({ document, id, number, entries: [...entries] }),
    agentSessionId: () => session?.id,
    async send(turn) {
      if (running) throw new Error('A Turn is running')
      running = true
      const checkpoint = await beforeTurn(turn).catch((error: unknown) => {
        console.error('No Checkpoint before this Turn:', error)
        return undefined
      })
      if (disposed) return
      add({ type: 'user', turn, ...(checkpoint && { checkpoint }) })
      agentSession().send(turn)
    },
    running: () => running,
    answerApproval: (id, decision) => session?.answerApproval(id, decision),
    interrupt: async () => session?.interrupt(),
    dispose() {
      disposed = true
      session?.close()
    },
  }
}
