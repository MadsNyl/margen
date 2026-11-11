import { tmpdir } from 'node:os'
import type { AgentEvent, ToolEvent } from '@shared/agent'
import { inProject } from '../../projects/inside'

// Turns the messages `claude` sends through the Agent SDK into AgentEvents.
// Messages are read defensively: the user's `claude` may be older or newer
// than the SDK, so unknown types and missing fields are skipped, not errors.
// Shapes: margen-notes/claude-agent-sdk.md, "Message → AgentEvent mapping".

type Json = Record<string, unknown>

const SIGNED_OUT = 'Your Claude Code login has expired. Sign in again to continue.'

/** Assistant errors that mean the user's own login needs redoing (user story 7). */
const LOGIN_ERRORS = new Set(['authentication_failed', 'oauth_org_not_allowed'])

const IMAGE = /\.(png|jpe?g|gif|webp)$/i
/** Temp folders, with and without macOS's `/private` in front. */
const TEMP_DIRS = [tmpdir(), '/tmp/', '/var/folders/'].flatMap((dir) => [dir, `/private${dir}`])

export type TurnOutcome = 'done' | 'interrupted' | 'failed'

export interface MessageMapper {
  /** The AgentEvents for one SDK message; for a `result`, the Turn's end. */
  map(message: unknown, turn: { interrupting: boolean }): AgentEvent[]
  /** The session id `claude` reported, once it has. */
  sessionId(): string | undefined
}

export function createMessageMapper(projectDir: string): MessageMapper {
  let sessionId: string | undefined
  /** Assistant messages whose text and thinking already arrived as stream deltas. */
  const streamed = new Set<string>()
  let streaming: string | undefined
  const tools = new Map<string, ToolEvent>()
  let failed = false

  function tool(id: string, name: string, input: Json): ToolEvent {
    const path = str(input.file_path) ?? str(input.notebook_path)
    const file = path === undefined ? '' : (inProject(projectDir, path) ?? path)
    switch (name) {
      case 'Read':
        return { type: 'tool', id, tool: 'read', file }
      case 'Write':
        return { type: 'tool', id, tool: 'write', file }
      case 'Edit':
      case 'MultiEdit':
      case 'NotebookEdit':
        return { type: 'tool', id, tool: 'edit', file }
      case 'Bash':
        return { type: 'tool', id, tool: 'shell', name, detail: str(input.command) ?? '' }
      case 'Glob':
      case 'Grep':
        return { type: 'tool', id, tool: 'search', name, detail: str(input.pattern) ?? '' }
      case 'WebFetch':
        return { type: 'tool', id, tool: 'web', name, detail: str(input.url) ?? '' }
      case 'WebSearch':
        return { type: 'tool', id, tool: 'web', name, detail: str(input.query) ?? '' }
      default:
        return { type: 'tool', id, tool: 'other', name, detail: '' }
    }
  }

  /** `claude` may Read the Turn's attached screenshots back from its own temp folder: not the user's files, so no tool card. */
  function readsAttachedImage(name: string | undefined, input: Json | undefined): boolean {
    const path = str(input?.file_path)
    if (name !== 'Read' || !path || inProject(projectDir, path) !== null || !IMAGE.test(path)) return false
    return TEMP_DIRS.some((dir) => path.startsWith(dir))
  }

  function assistant(message: Json): AgentEvent[] {
    const body = obj(message.message)
    const id = str(body?.id)
    const events: AgentEvent[] = []
    const error = str(message.error)
    if (error) {
      failed = true
      const text = blocks(body?.content).map((block) => str(block.text)).find(Boolean)
      return [LOGIN_ERRORS.has(error) ? { type: 'error', message: SIGNED_OUT, reason: 'signed-out' } : { type: 'error', message: text ?? error }]
    }
    const wasStreamed = id !== undefined && streamed.has(id)
    for (const block of blocks(body?.content)) {
      if (block.type === 'thinking' && !wasStreamed && str(block.thinking)) events.push({ type: 'thinking', text: str(block.thinking) })
      if (block.type === 'text' && !wasStreamed && str(block.text)) events.push({ type: 'text', text: str(block.text) ?? '' })
      if (block.type === 'tool_use' && str(block.id) && str(block.name) && !readsAttachedImage(str(block.name), obj(block.input))) {
        const started = tool(str(block.id) ?? '', str(block.name) ?? '', obj(block.input) ?? {})
        tools.set(started.id ?? '', started)
        events.push({ ...started, status: 'running' })
      }
    }
    return events
  }

  function toolResults(message: Json): AgentEvent[] {
    const events: AgentEvent[] = []
    for (const block of blocks(obj(message.message)?.content)) {
      const id = str(block.tool_use_id)
      const started = block.type === 'tool_result' && id ? tools.get(id) : undefined
      if (!started || !id) continue
      tools.delete(id)
      if (block.is_error === true) {
        events.push({ ...started, status: 'failed' })
        continue
      }
      const counts = 'file' in started && started.tool !== 'read' ? lineCounts(message.tool_use_result) : undefined
      events.push({ ...started, status: 'done', ...counts })
    }
    return events
  }

  function streamEvent(message: Json): AgentEvent[] {
    const event = obj(message.event)
    if (event?.type === 'message_start') streaming = str(obj(event.message)?.id)
    if (event?.type !== 'content_block_delta') return []
    const delta = obj(event.delta)
    if (streaming) streamed.add(streaming)
    if (delta?.type === 'text_delta' && str(delta.text)) return [{ type: 'text', text: str(delta.text) ?? '' }]
    if (delta?.type === 'thinking_delta' && str(delta.thinking)) return [{ type: 'thinking', text: str(delta.thinking) }]
    return []
  }

  function result(message: Json, interrupting: boolean): AgentEvent[] {
    const alreadyFailed = failed
    failed = false
    streamed.clear()
    tools.clear()
    if (interrupting) return [{ type: 'turn-end', reason: 'interrupted' }]
    if (alreadyFailed) return [{ type: 'turn-end', reason: 'failed' }]
    if (message.subtype === 'success' && message.is_error !== true) return [{ type: 'turn-end', reason: 'done' }]
    const errors = Array.isArray(message.errors) ? message.errors.filter((e): e is string => typeof e === 'string') : []
    const text = errors.join('\n') || str(message.result) || 'Claude Code stopped with an error.'
    const error: AgentEvent = /\/login|not logged in/i.test(text)
      ? { type: 'error', message: SIGNED_OUT, reason: 'signed-out' }
      : { type: 'error', message: text }
    return [error, { type: 'turn-end', reason: 'failed' }]
  }

  return {
    sessionId: () => sessionId,
    map(raw, { interrupting }) {
      const message = obj(raw)
      if (!message) return []
      // Subagent output (a Task tool's own work) stays out of the chat.
      if (typeof message.parent_tool_use_id === 'string') return []
      switch (message.type) {
        case 'system':
          if (message.subtype === 'init' && str(message.session_id)) sessionId = str(message.session_id)
          return []
        case 'stream_event':
          return streamEvent(message)
        case 'assistant':
          return assistant(message)
        case 'user':
          return toolResults(message)
        case 'result':
          return result(message, interrupting)
        default:
          return []
      }
    },
  }
}

/** Lines added and removed by a Write or Edit, from its structured result. */
function lineCounts(output: unknown): { added: number; removed: number } | undefined {
  const result = obj(output)
  if (!result) return undefined
  if (result.type === 'create' && typeof result.content === 'string') {
    return { added: result.content.split('\n').filter((line, i, all) => i < all.length - 1 || line !== '').length, removed: 0 }
  }
  if (!Array.isArray(result.structuredPatch)) return undefined
  let added = 0
  let removed = 0
  for (const hunk of result.structuredPatch) {
    for (const line of Array.isArray(obj(hunk)?.lines) ? (obj(hunk)?.lines as unknown[]) : []) {
      if (typeof line !== 'string') continue
      if (line.startsWith('+')) added++
      else if (line.startsWith('-')) removed++
    }
  }
  return { added, removed }
}

function obj(value: unknown): Json | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : undefined
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function blocks(content: unknown): Json[] {
  return Array.isArray(content) ? content.map(obj).filter((block): block is Json => block !== undefined) : []
}
