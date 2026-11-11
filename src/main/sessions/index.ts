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
  /**
   * Starts a Turn, or queues it while one runs. Resolves once a Turn started now has
   * reached the Agent, after `beforeTurn`; a queued one gets its own when it starts.
   */
  send(turn: TurnInput): Promise<void>
  /** A Turn is running, or the Queue is about to start one. */
  running(): boolean
  /** Answers a waiting approval-request, once; the answer becomes an entry. */
  answerApproval(id: string, decision: ApprovalDecision): void
  /** Allows every approval-request still waiting (the preset became Allow everything). */
  allowWaiting(): void
  unqueue(id: string): void
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
  /** Runs before each Turn reaches the Agent: takes its Checkpoint and resolves with the id, or `undefined` if none was taken. */
  beforeTurn?(turn: TurnInput): Promise<string | undefined>
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
  beforeTurn = async () => undefined,
  onEntry,
  onQueue,
}: DocumentSessionOptions): DocumentSession {
  const entries: SessionEntry[] = [...stored]
  /** approval-requests of the running Turn not answered yet. */
  const waiting = new Set<string>()
  let session: AgentSession | undefined
  let disposed = false
  /** The latest Turn's way to the Agent: its Checkpoint, then the send. */
  let starting = Promise.resolve()
  const queue = createTurnQueue({
    // Every Turn, sent now or released from the Queue, gets its Checkpoint here.
    start(turn) {
      starting = (async () => {
        const checkpoint = await beforeTurn(turn).catch((error: unknown) => {
          console.error('No Checkpoint before this Turn:', error)
          return undefined
        })
        if (disposed) return
        add({ type: 'user', turn, ...(checkpoint && { checkpoint }) })
        agentSession().send(turn)
      })()
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
      if (event.type === 'approval-request') waiting.add(event.id)
      if (event.type === 'turn-end') waiting.clear()
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
    queue: queueView,
    agentSessionId: () => session?.id,
    async send(turn) {
      queue.send(turn)
      await starting
    },
    running: () => queue.running(),
    unqueue: (messageId) => queue.unqueue(messageId),
    answerApproval,
    allowWaiting() {
      for (const id of [...waiting]) answerApproval(id, 'allow-once')
    },
    async interrupt() {
      queue.hold()
      // A Turn still taking its Checkpoint reaches the Agent first, then stops.
      await starting
      await session?.interrupt()
    },
    dispose() {
      disposed = true
      session?.close()
    },
  }
}
