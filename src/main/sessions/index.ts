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
  send(turn: TurnInput): void
  /** Answers a waiting approval-request, once; the answer becomes an entry. */
  answerApproval(id: string, decision: ApprovalDecision): void
  /** Allows every approval-request still waiting (the preset became Allow everything). */
  allowWaiting(): void
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
  onEntry,
}: DocumentSessionOptions): DocumentSession {
  const entries: SessionEntry[] = [...stored]
  /** approval-requests of the running Turn not answered yet. */
  const waiting = new Set<string>()
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
      if (event.type === 'turn-end') {
        running = false
        waiting.clear()
      }
      if (event.type === 'approval-request') waiting.add(event.id)
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

  function answerApproval(id: string, decision: ApprovalDecision) {
    if (!waiting.delete(id)) return
    add({ type: 'approval-answer', id, decision })
    session?.answerApproval(id, decision)
  }

  return {
    view: () => ({ document, id, number, entries: [...entries] }),
    agentSessionId: () => session?.id,
    send(turn) {
      if (running) throw new Error('A Turn is running')
      running = true
      add({ type: 'user', turn })
      agentSession().send(turn)
    },
    answerApproval,
    allowWaiting() {
      for (const id of [...waiting]) answerApproval(id, 'allow-once')
    },
    interrupt: async () => session?.interrupt(),
    dispose() {
      disposed = true
      session?.close()
    },
  }
}
