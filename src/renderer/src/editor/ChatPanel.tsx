import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ApprovalDecision, ToolEvent, TurnInput } from '@shared/agent'
import type { SessionEntry } from '@shared/host-api'
import { ClaudeMark } from '../components/icons'
import { host } from '../host'
import { CheckpointDivider, CheckpointDrawer } from './Checkpoints'
import { isRunning, toChat, type AgentError, type ApprovalRequest, type ChatItem, type ReplyPart } from './transcript'

/** The chat panel: the open Document's Session and the Composer. */
export function ChatPanel({ document }: { document: string }) {
  const entries = useSession(document)
  const items = useMemo(() => toChat(entries), [entries])
  const running = isRunning(items)
  const scroller = useRef<HTMLDivElement>(null)
  const [checkpointsOpen, setCheckpointsOpen] = useState(false)

  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items])

  return (
    <aside aria-label="Chat" className="relative mx-2 mb-2 flex w-[370px] min-h-0 flex-none flex-col">
      <div className="flex h-11 flex-none items-center gap-2 pr-1 pl-2">
        <span className="inline-flex items-center gap-2 text-[13.5px] font-medium">
          <ClaudeMark />
          Claude Code
        </span>
        <button aria-label="Checkpoints" title="Checkpoints" className="icon-btn ml-auto" onClick={() => setCheckpointsOpen(true)}>
          <HistoryIcon />
        </button>
      </div>
      <div ref={scroller} role="log" aria-label="Conversation" className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-2 pt-2.5 pb-[18px]">
        {items.length === 0 ? (
          <div className="m-auto px-8 text-center text-[13px] leading-relaxed text-tx3">Describe a change, or Pick and Draw on the page.</div>
        ) : (
          items.map((item, i) => (
            <Fragment key={i}>
              {item.kind === 'user' && item.checkpoint && <CheckpointDivider id={item.checkpoint} disabled={running} />}
              <Item item={item} running={running && i === items.length - 1} />
            </Fragment>
          ))
        )}
      </div>
      <Composer running={running} onSend={(turn) => void host.call('session.send', turn).catch(() => {})} />
      {checkpointsOpen && <CheckpointDrawer disabled={running} onClose={() => setCheckpointsOpen(false)} />}
    </aside>
  )
}

/** The open Document's Session entries: what's there now, then each new one as it arrives. */
function useSession(document: string): SessionEntry[] {
  const [entries, setEntries] = useState<SessionEntry[]>([])
  useEffect(() => {
    let live = true
    const off = host.on('session.entry', (payload) => {
      if (payload.document !== document) return
      setEntries((prev) => (payload.index === prev.length ? [...prev, payload.entry] : prev))
    })
    void host.call('session.current').then((view) => {
      if (live && view?.document === document) setEntries((prev) => (view.entries.length > prev.length ? view.entries : prev))
    })
    return () => {
      live = false
      off()
    }
  }, [document])
  return entries
}

function Item({ item, running }: { item: ChatItem; running: boolean }) {
  if (item.kind === 'user') {
    return (
      <div className="max-w-[90%] self-end rounded-[18px_18px_6px_18px] border border-line bg-white px-3.5 py-2.5 text-[13.5px] leading-[1.55] whitespace-pre-wrap shadow-[0_1px_3px_rgba(0,0,0,.03)] select-text">
        {item.turn.text}
      </div>
    )
  }
  const last = item.parts.at(-1)
  const busy = running && last?.kind !== 'text' && last?.kind !== 'approval'
  return (
    <div className="px-1 text-[13.5px] leading-[1.65]">
      {item.parts.map((part, i) => (
        <Part key={i} part={part} />
      ))}
      {busy && <Busy label={!last || last.kind === 'thinking' ? 'Thinking' : 'Working'} />}
      {item.end === 'interrupted' && <p className="text-[12.5px] text-tx3">Interrupted.</p>}
    </div>
  )
}

function Part({ part }: { part: ReplyPart }) {
  switch (part.kind) {
    case 'text':
      return <Reply text={part.text} />
    case 'thinking':
      // The shimmer shows that the Agent is thinking; its thoughts stay out of the chat.
      return null
    case 'tool':
      return <ToolCard tool={part.tool} />
    case 'approval':
      return <Approval request={part.request} />
    case 'error':
      return <ErrorCard error={part.error} />
  }
}

function Busy({ label }: { label: string }) {
  return (
    <span className="my-1 inline-flex items-center gap-2 text-[13px] text-tx2">
      <i className="spinner" />
      <span className="shimmer">{label}</span>
    </span>
  )
}

/** The Agent's reply: paragraphs, with `code` set in mono. */
function Reply({ text }: { text: string }) {
  return (
    <div className="select-text">
      {text
        .split(/\n{2,}/)
        .filter((paragraph) => paragraph.trim())
        .map((paragraph, i) => (
          <p key={i} className="mb-2 whitespace-pre-wrap">
            {paragraph.split(/`([^`\n]+)`/).map((piece, j) =>
              j % 2 ? (
                <code key={j} className="rounded-[5px] bg-muted px-[5px] py-px font-mono text-[11.5px]">
                  {piece}
                </code>
              ) : (
                piece
              ),
            )}
          </p>
        ))}
    </div>
  )
}

const TOOL_LABEL = { read: 'Read', edit: 'Edit', write: 'Write' } as const

function ToolCard({ tool }: { tool: ToolEvent }) {
  const label = 'file' in tool ? TOOL_LABEL[tool.tool] : tool.name
  const target = 'file' in tool ? tool.file : tool.detail
  return (
    <div
      role="group"
      aria-label="Tool"
      className="my-1.5 flex items-center gap-[9px] rounded-[10px] border border-line bg-white px-[11px] py-[7px] text-[12.5px] text-tx2"
    >
      <span className={`flex-none font-medium text-tx ${tool.status === 'running' ? 'tool-running' : ''}`}>{label}</span>
      <span className="min-w-0 truncate font-mono text-[11px]" title={target}>
        {target}
      </span>
      {tool.status === 'failed' && <span className="ml-auto text-[11px] text-tx3">failed</span>}
      {'file' in tool && tool.added !== undefined && (
        <span className="ml-auto flex-none font-mono text-[11px] text-mint-strong">+{tool.added}</span>
      )}
      {'file' in tool && tool.removed !== undefined && tool.removed > 0 && (
        <span className="flex-none font-mono text-[11px] text-ink-tx">−{tool.removed}</span>
      )}
    </div>
  )
}

/** An approval request. Ticket 09 makes these the prototype's cards and adds the permission presets. */
function Approval({ request }: { request: ApprovalRequest }) {
  const [answer, setAnswer] = useState<ApprovalDecision>()
  const what = request.kind === 'shell' ? 'run a shell command' : 'go outside the Project'
  const decide = (decision: ApprovalDecision) => {
    setAnswer(decision)
    void host.call('session.answerApproval', request.id, decision)
  }
  if (answer) {
    return (
      <div className="my-1.5 rounded-xl bg-mint px-3 py-2 text-xs text-[#185a36]">
        {answer === 'allow-once' ? '✓ Allowed once' : 'Denied'} · <span className="font-mono">{request.detail}</span>
      </div>
    )
  }
  return (
    <div className="my-1.5 rounded-xl border border-line bg-white px-3 py-2.5 text-[12.5px]">
      <div className="mb-2 text-tx2">
        Claude wants to {what}: <span className="font-mono text-[11.5px] break-all text-tx">{request.detail}</span>
      </div>
      <div className="flex gap-1.5">
        <button className="btn btn-primary h-7 px-3 text-[12px]" onClick={() => decide('allow-once')}>
          Allow once
        </button>
        <button className="btn h-7 px-3 text-[12px]" onClick={() => decide('deny')}>
          Deny
        </button>
      </div>
    </div>
  )
}

type SignIn = { state: 'idle' } | { state: 'waiting' } | { state: 'done' } | { state: 'failed'; message: string }

/** What went wrong; for a signed-out Claude Code, a way to sign in again (user story 7). */
function ErrorCard({ error }: { error: AgentError }) {
  const [signIn, setSignIn] = useState<SignIn>({ state: 'idle' })
  const start = () => {
    setSignIn({ state: 'waiting' })
    void host.call('agent.signIn').then(
      (result) => setSignIn(result.ok ? { state: 'done' } : { state: 'failed', message: result.message }),
      (failure: unknown) => setSignIn({ state: 'failed', message: failure instanceof Error ? failure.message : String(failure) }),
    )
  }
  let action: ReactNode = null
  if (error.reason === 'signed-out') {
    action =
      signIn.state === 'waiting' ? (
        <p className="mt-1.5 text-tx2">Finish signing in in Terminal. This updates when you're done.</p>
      ) : signIn.state === 'done' ? (
        <p className="mt-1.5 text-[#185a36]">Signed in. Send your message again.</p>
      ) : (
        <>
          {signIn.state === 'failed' && <p className="mt-1.5 text-tx2">{signIn.message}</p>}
          <button className="btn mt-2 h-7 px-3 text-[12px]" onClick={start}>
            Sign in again
          </button>
        </>
      )
  }
  return (
    <div role="alert" className="my-1.5 rounded-xl bg-[#fdeeee] px-3 py-2.5 text-[12.5px] leading-normal text-[#8f1d1d]">
      <p className="select-text">{error.message}</p>
      {action}
    </div>
  )
}

const MAX_INPUT_HEIGHT = 160

/** The draft message. ↵ sends, ⇧↵ makes a new line. The Queue (ticket 10) lets it send during a Turn. */
function Composer({ running, onSend }: { running: boolean; onSend: (turn: TurnInput) => void }) {
  const [text, setText] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const canSend = text.trim() !== '' && !running

  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`
  }, [text])

  const send = () => {
    if (!canSend) return
    onSend({ text: text.trim(), annotations: [] })
    setText('')
  }

  return (
    <div className="mx-1 mb-2 rounded-[22px] bg-white shadow-[0_8px_28px_-10px_rgba(0,0,0,.18),0_0_0_1px_rgba(0,0,0,.07)]">
      <textarea
        ref={input}
        rows={1}
        aria-label="Message"
        placeholder="Describe a change, or Pick / Draw on the page…"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            send()
          }
        }}
        className="block max-h-[160px] min-h-[50px] w-full resize-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-sm leading-normal outline-0 placeholder:text-tx3"
      />
      <div className="flex items-center gap-0.5 pt-1 pr-2 pb-2 pl-2.5">
        {/* The model and effort picker (ticket 10) and the permission preset (ticket 09). */}
        <span className="inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-[12px] text-tx2" title="Claude Code's default model">
          Default model
        </span>
        <span className="inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-[12px] text-tx2" title="Permission preset">
          <ShieldIcon />
          Editor
        </span>
        <span className="flex-1" />
        <button
          aria-label="Send"
          title="Send (↵)"
          disabled={!canSend}
          onClick={send}
          className="grid size-8 place-items-center rounded-full bg-primary text-white disabled:cursor-default disabled:bg-[#d4d4d8]"
        >
          <svg viewBox="0 0 20 20" className="size-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10 16V4M5 9l5-5 5 5" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 fill-none stroke-current" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 2" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-3.5 fill-none stroke-current" strokeWidth={1.6} strokeLinejoin="round" aria-hidden>
      <path d="M10 2l6 2.5v4.6c0 4-2.6 7-6 8.4-3.4-1.4-6-4.4-6-8.4V4.5z" />
    </svg>
  )
}
