import { useState } from 'react'
import type { Checkpoint } from '@shared/host-api'
import { host, useHostValue } from '../host'

// Checkpoints in the editor: the divider with "Revert to here" before each
// Turn in the chat, and the Project's list across every Session. The list is
// self-contained so the history drawer (ticket 08) can show it as its
// Checkpoints tab. A revert is undoable: the host takes a Checkpoint first.

/** The current Project's Checkpoints, newest first. */
export function useCheckpoints(): Checkpoint[] {
  return useHostValue('checkpoints.list', 'checkpoints.changed') ?? []
}

/** Reverts to a Checkpoint; `pending` is the one being reverted to. */
function useRevert() {
  const [pending, setPending] = useState<string>()
  const revert = (id: string) => {
    setPending(id)
    void host
      .call('checkpoints.revert', id)
      .catch((error: unknown) => console.error('Revert failed:', error))
      .finally(() => setPending(undefined))
  }
  return { pending, revert }
}

/** The dashed divider before a Turn in the chat. */
export function CheckpointDivider({ id, disabled }: { id: string; disabled: boolean }) {
  const checkpoint = useCheckpoints().find((c) => c.id === id)
  const { pending, revert } = useRevert()
  return (
    <div role="separator" aria-label={`Checkpoint ${checkpoint?.number ?? ''}`.trim()} className="checkpoint flex items-center gap-2.5 text-[11.5px] text-tx3">
      {checkpoint ? `Checkpoint ${checkpoint.number}` : 'Checkpoint'}
      <button
        disabled={disabled || pending !== undefined}
        onClick={() => revert(id)}
        className="rounded-full border border-line bg-white px-[9px] py-0.5 text-[11.5px] text-tx2 hover:border-[#ccc] hover:text-tx disabled:opacity-50"
      >
        {pending ? 'Reverting…' : 'Revert to here'}
      </button>
    </div>
  )
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** The Project's Checkpoints from every Session, newest first, under "Now". */
export function CheckpointList({ disabled }: { disabled: boolean }) {
  const checkpoints = useCheckpoints()
  const { pending, revert } = useRevert()
  return (
    <div role="list" aria-label="Checkpoints" className="timeline relative min-h-0 flex-1 overflow-auto pr-1 pl-6">
      <div role="listitem" className="relative mb-1 rounded-xl bg-white px-3 py-[11px] shadow-[0_0_0_1px_var(--color-line)]">
        <b className="block text-[13.5px] font-medium">Now</b>
      </div>
      {checkpoints.map((checkpoint) => (
        <div role="listitem" key={checkpoint.id} className="relative mb-1 rounded-xl px-3 py-[11px] hover:bg-white">
          <b className="flex items-center justify-between text-[13.5px] font-medium">
            Checkpoint {checkpoint.number}
            <button
              disabled={disabled || pending !== undefined}
              onClick={() => revert(checkpoint.id)}
              className="h-7 rounded-[7px] px-[9px] text-[12.5px] font-normal text-tx2 hover:bg-black/4 hover:text-tx disabled:opacity-50"
            >
              {pending === checkpoint.id ? 'Reverting…' : 'Revert'}
            </button>
          </b>
          <small className="mt-[3px] block truncate text-[12px] text-tx3" title={checkpoint.text}>
            {checkpoint.reason === 'revert' ? 'Before a revert' : `Before a turn · ${checkpoint.document}`} · {time(checkpoint.takenAt)}
          </small>
        </div>
      ))}
      {checkpoints.length === 0 && <p className="px-3 py-3 text-[12px] leading-normal text-tx3">A Checkpoint is taken before every Turn.</p>}
    </div>
  )
}

/**
 * The Checkpoints list over the chat. A stand-in until ticket 08's history
 * drawer, which shows `CheckpointList` as its Checkpoints tab instead.
 */
export function CheckpointDrawer({ disabled, onClose }: { disabled: boolean; onClose: () => void }) {
  return (
    <div role="dialog" aria-label="Checkpoints" className="absolute inset-0 z-30 flex flex-col bg-shell">
      <div className="flex items-center gap-1 px-1 pt-2 pb-2.5">
        <span className="rounded-full bg-white px-3 py-1.5 text-[12.5px] font-medium shadow-[0_1px_3px_rgba(0,0,0,.08)]">Checkpoints</span>
        <button aria-label="Close" className="icon-btn ml-auto" onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="px-3 pb-2 text-[12px] leading-normal text-tx3">Checkpoints belong to the Project, so every Session shares them.</p>
      <CheckpointList disabled={disabled} />
    </div>
  )
}
