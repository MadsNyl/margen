import { useMemo } from 'react'
import { ArrowUpIcon, ShowChatIcon } from '../components/icons'
import { plural } from '../format'
import { useDraft } from './draft'
import { useSession } from './session'
import { isRunning, toChat } from './transcript'

/**
 * While the chat is hidden: the Composer's draft in one floating bar over the
 * Document, so the Annotations collected can go out (or into the Queue during
 * a Turn) without opening the chat. Shown only when there is something to send
 * or a Turn is running.
 */
export function HiddenChatBar({ document, onShowChat }: { document: string; onShowChat: () => void }) {
  const draft = useDraft()
  const session = useSession(document)
  const running = useMemo(() => isRunning(toChat(session?.entries ?? [])), [session?.entries])
  const count = draft.annotations.length
  if (!draft.hasContent && !running) return null

  const what = [count > 0 && plural(count, 'Annotation'), draft.text.trim() && 'a message'].filter(Boolean).join(' and ')
  return (
    <div
      role="region"
      aria-label="Draft"
      className="absolute right-4 bottom-[22px] z-20 flex items-center gap-1 rounded-full bg-white py-1 pr-1 pl-3.5 text-[12.5px] text-tx2 shadow-[0_8px_28px_-10px_rgba(0,0,0,.25),0_0_0_1px_rgba(0,0,0,.07)]"
    >
      {running && <span className="shimmer mr-1">Claude is working</span>}
      {what && <span className="mr-1 text-tx">{what}</span>}
      <button className="icon-btn size-8 rounded-full" title="Open the chat" aria-label="Open the chat" onClick={onShowChat}>
        <ShowChatIcon />
      </button>
      {draft.hasContent && (
        <button
          className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium ${running ? 'bg-yellow-strong text-[#2b1d00]' : 'bg-primary text-white'}`}
          title={running ? 'Queue: sends when Claude finishes' : 'Send'}
          onClick={() => draft.send()}
        >
          {running ? 'Queue' : 'Send'}
          {!running && <ArrowUpIcon className="size-3.5" />}
        </button>
      )}
    </div>
  )
}
