import type { ApprovalDecision, TurnInput } from '@shared/agent'
import type { SessionEntry, SessionView } from '@shared/host-api'
import type { AgentProvider, AgentSession } from '../agent/provider'
import type { PermissionPolicy } from '../permissions'

// The open Document's Session: its entries, and the Agent session behind it,
// started on the first Turn. Kept in memory for now; ticket 08 stores Sessions
// per Document (with `agentSessionId` to resume) and lists past ones.

export interface DocumentSession {
  view(): SessionView
  /** The Agent's session id, once a Turn has started it. */
  agentSessionId(): string | undefined
  send(turn: TurnInput): void
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
  permissions: PermissionPolicy
  /** Resumes this Agent session instead of starting a new one. */
  resumeId?: string
  onEntry(entry: SessionEntry, index: number): void
}

export function startDocumentSession({
  agent,
  projectDir,
  document,
  permissions,
  resumeId,
  onEntry,
}: DocumentSessionOptions): DocumentSession {
  const entries: SessionEntry[] = []
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
      session = agent.startSession({ projectDir, document, permissions, ...(resumeId && { resumeId }) })
      void pump(session)
    }
    return session
  }

  return {
    view: () => ({ document, entries: [...entries] }),
    agentSessionId: () => session?.id,
    send(turn) {
      if (running) throw new Error('A Turn is running')
      running = true
      add({ type: 'user', turn })
      agentSession().send(turn)
    },
    answerApproval: (id, decision) => session?.answerApproval(id, decision),
    interrupt: async () => session?.interrupt(),
    dispose() {
      disposed = true
      session?.close()
    },
  }
}
