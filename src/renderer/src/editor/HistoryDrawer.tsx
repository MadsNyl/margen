import { useEffect, useState } from 'react'
import type { SessionSummary } from '@shared/host-api'
import { plural } from '../format'
import { host } from '../host'
import { CheckpointList } from './Checkpoints'

type Tab = 'sessions' | 'checkpoints'

/** The history drawer over the chat: the Document's Sessions to resume, and the Project's Checkpoints. `running`: a Turn is, so reverting waits. */
export function HistoryDrawer({ open, running, onClose }: { open: boolean; running: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('sessions')
  const [sessions, setSessions] = useState<SessionSummary[]>([])

  useEffect(() => {
    if (!open) return
    let live = true
    void host.call('sessions.list').then((list) => live && setSessions(list))
    return () => {
      live = false
    }
  }, [open])

  const resume = (session: SessionSummary) => {
    onClose()
    if (!session.active) void host.call('session.resume', session.id).catch(() => {})
  }

  return (
    <div
      role="region"
      aria-label="History"
      hidden={!open}
      className="absolute inset-0 z-30 flex flex-col bg-shell"
    >
      <div role="tablist" className="flex items-center gap-1 px-1 pt-2 pb-2.5">
        <DrawerTab selected={tab === 'sessions'} onSelect={() => setTab('sessions')}>
          Sessions
        </DrawerTab>
        <DrawerTab selected={tab === 'checkpoints'} onSelect={() => setTab('checkpoints')}>
          Checkpoints
        </DrawerTab>
        <button
          aria-label="Close history"
          className="ml-auto grid size-8 place-items-center rounded-lg text-tx2 hover:bg-black/4 hover:text-tx"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      {tab === 'sessions' && (
        <div role="tabpanel" className="min-h-0 flex-1 overflow-auto px-1">
          <ul aria-label="Sessions">
            {sessions.map((session) => (
              <li key={session.id}>
                <button
                  className={`mb-1 block w-full rounded-xl px-3 py-[11px] text-left hover:bg-white ${session.active ? 'bg-white shadow-[0_0_0_1px_var(--color-line)]' : ''}`}
                  onClick={() => resume(session)}
                >
                  <b className="flex items-center justify-between text-[13.5px] font-medium">
                    Session {session.number}
                    {session.active && <em className="text-[11px] font-medium text-mint-strong not-italic">● Active</em>}
                  </b>
                  <small className="mt-[3px] block truncate text-xs text-tx3">
                    {startedAt(session.startedAt)} · {plural(session.turns, 'turn')} · “{session.firstMessage}”
                  </small>
                </button>
              </li>
            ))}
          </ul>
          <p className="p-3 text-xs leading-normal text-tx3">
            {sessions.length === 0 ? 'Sessions show up here once you send a message. ' : 'Resume any Session to pick up where you left off. '}
            Checkpoints belong to the Project, so every Session shares them.
          </p>
        </div>
      )}
      {tab === 'checkpoints' && (
        <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
          <CheckpointList disabled={running} />
        </div>
      )}
    </div>
  )
}

function DrawerTab({
  selected,
  disabled,
  onSelect,
  children,
}: {
  selected: boolean
  disabled?: boolean
  onSelect: () => void
  children: string
}) {
  return (
    <button
      role="tab"
      aria-selected={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-50 ${selected ? 'bg-white text-tx shadow-[0_1px_3px_rgba(0,0,0,.08)]' : 'text-tx2'}`}
    >
      {children}
    </button>
  )
}

/** "Today, 14:02", "Yesterday, 11:20", "Oct 28, 09:15". */
function startedAt(iso: string, now = new Date()): string {
  const then = new Date(iso)
  const time = then.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(then)) / 86_400_000)
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  return `${then.toLocaleDateString('en', { month: 'short', day: 'numeric' })}, ${time}`
}
