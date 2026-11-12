import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ApprovalDecision } from '@shared/agent'
import type { PermissionPreset } from '@shared/host-api'
import { AddIcon, ArrowUpIcon, CheckIcon, ClaudeMark, HistoryIcon, ShieldIcon } from '../components/icons'
import { useOpenSettings } from '../components/Settings'
import { host, useHostValue } from '../host'
import { Activity, type Step } from './Activity'
import { AnnotationRows, Chips } from './annotations'
import { AttachmentChips } from './attachments'
import { useDraft } from './draft'
import { CheckpointDivider } from './Checkpoints'
import { HistoryDrawer } from './HistoryDrawer'
import { useLeave } from './leave'
import { Reply } from './Markdown'
import { ModelPicker } from './ModelPicker'
import { QueuePanel } from './Queue'
import { useSession } from './session'
import { isRunning, toChat, type AgentError, type ApprovalRequest, type ChatItem, type ReplyPart } from './transcript'

/** The chat panel: the open Document's Session and the Composer. */
export function ChatPanel({ document }: { document: string }) {
  const session = useSession(document)
  const entries = session?.entries
  const items = useMemo(() => toChat(entries ?? []), [entries])
  const [history, setHistory] = useState(false)
  const running = isRunning(items)
  const queue = useHostValue('session.queue', 'session.queue')
  const queued = queue?.document === document && queue.messages.length > 0 ? queue : undefined
  // Reverting waits while a Turn runs or the Queue is about to start one.
  const busy = running || (queued !== undefined && !queued.held)
  const scroller = useRef<HTMLDivElement>(null)
  const leave = useLeave()

  // Esc stops the running Turn, unless something else (a menu, a popup, the comment box, leaving Pick or Draw) took it first.
  useEffect(() => {
    if (!running) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) void host.call('session.interrupt')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running])

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
        {session && <span className="truncate text-[12.5px] whitespace-nowrap text-tx3">· Session {session.number}</span>}
        <div className="ml-auto flex">
          <HeaderButton label="New session" onClick={() => leave(() => host.call('session.new').catch(() => {}))}>
            <AddIcon />
          </HeaderButton>
          <HeaderButton label="Sessions & Checkpoints" onClick={() => setHistory(true)}>
            <HistoryIcon />
          </HeaderButton>
        </div>
      </div>
      <div ref={scroller} role="log" aria-label="Conversation" className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-2 pt-2.5 pb-[18px]">
        {items.length === 0 ? (
          <div className="m-auto px-8 text-center text-[13px] leading-relaxed text-tx3">Describe a change, or Pick and Draw on the page.</div>
        ) : (
          items.map((item, i) => (
            <Fragment key={i}>
              {item.kind === 'user' && item.checkpoint && <CheckpointDivider id={item.checkpoint} disabled={busy} />}
              <Item item={item} running={running && i === items.length - 1} />
            </Fragment>
          ))
        )}
      </div>
      {queued && <QueuePanel queue={queued} />}
      <Composer running={running} queued={queued !== undefined} onStop={() => void host.call('session.interrupt')} />
      <HistoryDrawer open={history} running={busy} onClose={() => setHistory(false)} />
    </aside>
  )
}

function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg text-tx2 hover:bg-black/4 hover:text-tx"
    >
      {children}
    </button>
  )
}

function Item({ item, running }: { item: ChatItem; running: boolean }) {
  if (item.kind === 'user') {
    return (
      <div className="max-w-[90%] self-end rounded-[18px_18px_6px_18px] border border-line bg-white px-3.5 py-2.5 text-[13.5px] leading-[1.55] whitespace-pre-wrap shadow-[0_1px_3px_rgba(0,0,0,.03)] select-text">
        <AnnotationRows annotations={item.turn.annotations} />
        {item.turn.text}
        {item.turn.attachments?.length ? (
          <div className="mt-2">
            <AttachmentChips files={item.turn.attachments} />
          </div>
        ) : null}
      </div>
    )
  }
  const blocks = toBlocks(item.parts)
  return (
    <div className="px-1 text-[13.5px] leading-[1.65]">
      {blocks.map((block, i) =>
        block.kind === 'activity' ? (
          <Activity key={i} steps={block.steps} active={running && i === blocks.length - 1} />
        ) : (
          <Part key={i} part={block.part} />
        ),
      )}
      {running && blocks.length === 0 && <Busy label="Thinking" />}
      {item.end === 'interrupted' && <p className="text-[12.5px] text-tx3">Interrupted.</p>}
    </div>
  )
}

type Block = { kind: 'activity'; steps: Step[] } | { kind: 'part'; part: Exclude<ReplyPart, { kind: 'thinking' | 'tool' }> }

/** Runs of thinking and tool calls become one Activity each; text, approvals and errors stand on their own. */
function toBlocks(parts: ReplyPart[]): Block[] {
  const blocks: Block[] = []
  for (const part of parts) {
    if (part.kind === 'thinking' || part.kind === 'tool') {
      const last = blocks.at(-1)
      const step: Step = part.kind === 'tool' ? { kind: 'tool', tool: part.tool } : { kind: 'thinking' }
      if (last?.kind === 'activity') last.steps.push(step)
      else blocks.push({ kind: 'activity', steps: [step] })
    } else blocks.push({ kind: 'part', part })
  }
  return blocks
}

function Part({ part }: { part: Extract<Block, { kind: 'part' }>['part'] }) {
  switch (part.kind) {
    case 'text':
      return <Reply text={part.text} />
    case 'approval':
      return <Approval request={part.request} answer={part.answer} />
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

const ASKS_TO: Record<ApprovalRequest['kind'], string> = {
  shell: 'run a shell command',
  'outside-project': 'go outside the Project',
  other: 'use a tool',
}

/** An approval request: Allow once or Deny, then the answer as a resolved card. */
function Approval({ request, answer }: { request: ApprovalRequest; answer: ApprovalDecision | undefined }) {
  const [sent, setSent] = useState<ApprovalDecision>()
  const resolved = answer ?? sent
  const decide = (decision: ApprovalDecision) => {
    setSent(decision)
    void host.call('session.answerApproval', request.id, decision)
  }
  if (resolved) {
    const allowed = resolved === 'allow-once'
    return (
      <div
        role="group"
        aria-label="Approval"
        className={`my-1.5 rounded-xl px-3 py-2 text-xs ${allowed ? 'bg-mint text-[#185a36]' : 'bg-muted text-tx2'}`}
      >
        {allowed ? (
          <>
            <CheckIcon className="mb-px inline size-3" /> Allowed once
          </>
        ) : (
          'Denied'
        )}{' '}
        · <span className="font-mono break-all">{request.detail}</span>
      </div>
    )
  }
  return (
    <div role="group" aria-label="Approval" className="my-1.5 rounded-xl border border-line bg-white px-3 py-2.5 text-[12.5px]">
      <div className="mb-2 text-tx2">
        Claude wants to {ASKS_TO[request.kind]}: <span className="font-mono text-[11.5px] break-all text-tx">{request.detail}</span>
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
      (result) => setSignIn(result.ok ? { state: 'done' } : result.cancelled ? { state: 'idle' } : { state: 'failed', message: result.message }),
      (failure: unknown) => setSignIn({ state: 'failed', message: failure instanceof Error ? failure.message : String(failure) }),
    )
  }
  let action: ReactNode = null
  if (error.reason === 'signed-out') {
    action =
      signIn.state === 'waiting' ? (
        <>
          <p className="mt-1.5 text-tx2">Finish signing in in Terminal. This updates when you're done.</p>
          <button className="btn mt-2 h-7 px-3 text-[12px]" onClick={() => void host.call('agent.cancelSignIn')}>
            Cancel
          </button>
        </>
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

/**
 * The draft message, with its Annotations as chips. ↵ sends, or queues it during a Turn; ⇧↵ makes a new line.
 * The draft (with the model choice) is shared with the comment boxes on the Document (`draft.tsx`).
 */
function Composer({
  running,
  queued,
  onStop,
}: {
  running: boolean
  /** The Queue shows above, so the top corners join it. */
  queued: boolean
  onStop: () => void
}) {
  const { text, setText, hasContent, choice, setChoice, send: sendDraft } = useDraft()
  const input = useRef<HTMLTextAreaElement>(null)
  const canSend = hasContent

  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`
  }, [text])

  const send = () => {
    if (canSend) sendDraft()
  }

  return (
    <div className={`mx-1 mb-2 rounded-[22px] bg-white ${queued ? 'rounded-t-none' : ''} shadow-[0_8px_28px_-10px_rgba(0,0,0,.18),0_0_0_1px_rgba(0,0,0,.07)]`}>
      <Chips />
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
        <ModelPicker value={choice} onChange={setChoice} />
        <PresetBadge />
        <span className="flex-1" />
        {running && (
          <button aria-label="Stop" title="Stop (Esc)" onClick={onStop} className="mr-1 grid size-8 place-items-center rounded-full bg-muted hover:bg-muted2">
            <i className="size-2.5 rounded-[2px] bg-tx" />
          </button>
        )}
        {running ? (
          <button
            aria-label="Queue"
            title="Queue (↵): sends when Claude finishes"
            disabled={!canSend}
            onClick={send}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-yellow-strong px-3 text-[12.5px] font-semibold text-[#2b1d00] disabled:cursor-default disabled:bg-[#d4d4d8] disabled:text-white"
          >
            Queue <kbd className="border-black/20 bg-transparent text-black/55">↵</kbd>
          </button>
        ) : (
          <button
            aria-label="Send"
            title="Send (↵)"
            disabled={!canSend}
            onClick={send}
            className="grid size-8 place-items-center rounded-full bg-primary text-white disabled:cursor-default disabled:bg-[#d4d4d8]"
          >
            <ArrowUpIcon />
          </button>
        )}
      </div>
    </div>
  )
}

const PRESET_LABEL: Record<PermissionPreset, string> = { editor: 'Editor', 'allow-everything': 'Allow all' }

/** The active permission preset. Clicking it opens Settings, where it's switched. */
function PresetBadge() {
  const preset = useHostValue('permissions.preset', 'permissions.changed')
  const openSettings = useOpenSettings()
  return (
    <button
      aria-label="Permission preset"
      title={preset === 'allow-everything' ? 'Allow everything: Claude never asks' : 'Editor preset: shell commands and paths outside the Project ask first'}
      className="inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[12px] text-tx2 hover:bg-muted hover:text-tx"
      onClick={openSettings}
    >
      <ShieldIcon />
      {preset && PRESET_LABEL[preset]}
    </button>
  )
}

