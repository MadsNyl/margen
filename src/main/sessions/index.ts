import type { ApprovalDecision, TurnInput } from '@shared/agent'
import type { QueueView, SessionEntry, SessionView } from '@shared/host-api'
import type { AgentProvider, AgentSession } from '../agent/provider'
import type { PermissionPolicy } from '../permissions'
import { createTurnQueue } from '../turns/queue'

// The open Document's Session: its entries, and the Agent session behind it,
// started on the first Turn. `documentSessions` (./document.ts) stores them per
// Document and switches between them.

export interface DocumentSession {
  view(): SessionView
  queue(): QueueView
  /** The Agent's session id, once a Turn has started it. */
  agentSessionId(): string | undefined
  /** Starts a Turn, or queues it while one runs. */
  send(turn: TurnInput): void
  unqueue(id: string): void
  answerApproval(id: string, decision: ApprovalDecision): void
  /** Stops the running Turn and holds the Queue. */
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
  onQueue(queue: QueueView): void
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
  onQueue,
}: DocumentSessionOptions): DocumentSession {
  const entries: SessionEntry[] = [...stored]
  let session: AgentSession | undefined
  let disposed = false
  const queue = createTurnQueue({
    start(turn) {
      add({ type: 'user', turn })
      agentSession().send(turn)
    },
    onChange: () => !disposed && onQueue(queueView()),
  })

  function queueView(): QueueView {
    return { document, messages: queue.messages(), held: queue.held() }
  }

  function add(entry: SessionEntry) {
    if (disposed) return
    entries.push(entry)
    onEntry(entry, entries.length - 1)
  }

  async function pump(from: AgentSession) {
    for await (const event of from.events) {
      if (disposed) return
      add(event)
      if (event.type === 'turn-end') {
        // A failed Turn holds the Queue too: what's queued would likely fail the same way.
        if (event.reason !== 'done') queue.hold()
        queue.turnEnded()
      }
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
    view: () => ({ document, id, number, entries: [...entries] }),
    queue: queueView,
    agentSessionId: () => session?.id,
    send: (turn) => queue.send(turn),
    unqueue: (messageId) => queue.unqueue(messageId),
    answerApproval: (id, decision) => session?.answerApproval(id, decision),
    async interrupt() {
      queue.hold()
      await session?.interrupt()
    },
    dispose() {
      disposed = true
      session?.close()
    },
  }
}
