import type { QueueView } from '@shared/host-api'
import { host } from '../host'
import { CloseIcon } from '../components/icons'

/** The yellow Queue above the Composer: messages sent during a Turn, in the order they'll go out. */
export function QueuePanel({ queue }: { queue: QueueView }) {
  return (
    <section aria-label="Queue" className="mx-1 rounded-t-2xl border border-b-0 border-[#f3dc94] bg-[#fff8e1] px-3 pt-2 pb-1.5">
      <h6 className="m-0 mb-1 flex justify-between text-[11px] font-semibold text-[#8a6200]">
        Queued
        <span className="font-normal text-[#b08a2e]">{queue.held ? 'waits until you send again' : 'sends when Claude finishes'}</span>
      </h6>
      <ul>
        {queue.messages.map(({ id, turn }, i) => (
          <li key={id} className="flex items-center gap-2 border-t border-black/5 py-[5px] text-[12.5px] text-tx2 first:border-t-0">
            <span className="text-[11px] text-[#b08a2e]">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">
              {turn.text || turn.annotations.map((a) => `#${a.number} ${a.comment || a.kind}`).join(', ')}
            </span>
            <button aria-label="Remove" title="Remove" className="grid place-items-center px-1 text-tx3 hover:text-tx" onClick={() => void host.call('session.unqueue', id)}>
              <CloseIcon className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
