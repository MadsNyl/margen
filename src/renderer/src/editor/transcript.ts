import type { AgentEvent, ApprovalDecision, ToolEvent, TurnInput } from '@shared/agent'
import type { SessionEntry } from '@shared/host-api'

// Folds a Session's entries into what the chat shows: the user's messages and,
// after each, the Agent's reply with its streamed text joined up and each tool
// call as one card that updates from running to done. An approval-request
// carries its answer once given; one the Turn ended without is denied, as the
// Agent treats it.

export type ApprovalRequest = Extract<AgentEvent, { type: 'approval-request' }>
export type AgentError = Extract<AgentEvent, { type: 'error' }>

export type ReplyPart =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool'; tool: ToolEvent }
  | { kind: 'approval'; request: ApprovalRequest; answer?: ApprovalDecision }
  | { kind: 'error'; error: AgentError }

export type ChatItem =
  | { kind: 'user'; turn: TurnInput }
  | { kind: 'reply'; parts: ReplyPart[]; end?: Extract<AgentEvent, { type: 'turn-end' }>['reason'] }

export function toChat(entries: SessionEntry[]): ChatItem[] {
  const items: ChatItem[] = []
  let reply: Extract<ChatItem, { kind: 'reply' }> | undefined

  for (const entry of entries) {
    if (entry.type === 'user') {
      items.push({ kind: 'user', turn: entry.turn })
      reply = { kind: 'reply', parts: [] }
      items.push(reply)
      continue
    }
    if (!reply) continue
    const last = reply.parts.at(-1)
    switch (entry.type) {
      case 'text':
        if (last?.kind === 'text') last.text += entry.text
        else reply.parts.push({ kind: 'text', text: entry.text })
        break
      case 'thinking':
        if (last?.kind === 'thinking') last.text += entry.text ?? ''
        else reply.parts.push({ kind: 'thinking', text: entry.text ?? '' })
        break
      case 'tool': {
        const earlier = entry.id ? reply.parts.find((part) => part.kind === 'tool' && part.tool.id === entry.id) : undefined
        if (earlier?.kind === 'tool') earlier.tool = entry
        else reply.parts.push({ kind: 'tool', tool: entry })
        break
      }
      case 'approval-request':
        reply.parts.push({ kind: 'approval', request: entry })
        break
      case 'approval-answer':
        for (const part of reply.parts) if (part.kind === 'approval' && part.request.id === entry.id) part.answer = entry.decision
        break
      case 'error':
        reply.parts.push({ kind: 'error', error: entry })
        break
      case 'turn-end':
        for (const part of reply.parts) if (part.kind === 'approval') part.answer ??= 'deny'
        reply.end = entry.reason
        reply = undefined
        break
    }
  }
  return items
}

/** Whether a Turn is still running: the last reply hasn't ended. */
export function isRunning(items: ChatItem[]): boolean {
  const last = items.at(-1)
  return last?.kind === 'reply' && last.end === undefined
}
