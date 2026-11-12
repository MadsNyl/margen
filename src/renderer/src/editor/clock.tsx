import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { formatTime } from '@shared/clock'
import type { ClockState } from '@shared/document-bridge'
import { PauseIcon, PlayIcon } from '../components/icons'
import type { DocumentBridge } from './bridge'

// An Animation video's clock in the editor: what the page's script last said
// about it, and play and pause. Each time the page (re)loads, it's seeked back to
// where it was, so a reload after an edit keeps the paused time.

const RESTORE = 'restore'

export interface VideoClock {
  /** Left out until the page's script has first said where its clock is. */
  state?: ClockState
  play(): void
  pause(): void
}

/** The clock of the Document open at `url` while it's an Animation video (`video`); `null` while it isn't. */
export function useVideoClock(bridge: DocumentBridge | null, video: boolean, url: string): VideoClock | null {
  const [state, setState] = useState<{ url: string; clock: ClockState }>()
  /** Where the clock last was, kept across the page's reloads. */
  const kept = useRef<{ url: string; time: number } | null>(null)

  useEffect(() => {
    if (!bridge || !video) return
    const time = kept.current?.url === url ? kept.current.time : 0
    // Until the seek is answered, what the newly loaded page says (paused at 0) isn't where the video is.
    let restoring = true
    const off = bridge.on((message) => {
      if (message.type !== 'clock' || (restoring && message.id !== RESTORE)) return
      restoring = false
      kept.current = { url, time: message.clock.time }
      // Every frame while playing; the editor only redraws then when what the timer shows changes.
      const { clock } = message
      setState((now) => (now?.url === url && sameTenth(now.clock, clock) ? now : { url, clock }))
    })
    bridge.send({ type: 'clock-seek', time, id: RESTORE })
    return off
  }, [bridge, video, url])

  if (!video) return null
  return {
    state: state?.url === url ? state.clock : undefined,
    play: () => bridge?.send({ type: 'clock-play' }),
    pause: () => bridge?.send({ type: 'clock-pause' }),
  }
}

/** Two frames while playing that the top bar shows the same. A paused clock is always taken as it is. */
function sameTenth(a: ClockState, b: ClockState): boolean {
  return (
    a.playing &&
    b.playing &&
    formatTime(a.time) === formatTime(b.time) &&
    a.length === b.length &&
    a.frame.width === b.frame.width &&
    a.frame.height === b.frame.height
  )
}

const PausedTime = createContext<number | undefined>(undefined)

export const PausedTimeProvider = PausedTime.Provider

/** On an Animation video, the time its clock is at: what a new Annotation records. */
export function usePausedTime(): number | undefined {
  return useContext(PausedTime)
}

/** The top bar's play/pause and timer (current time / length). No scrub bar. */
export function VideoControls({ clock }: { clock: VideoClock }) {
  const { state } = clock
  const playing = state?.playing ?? false
  return (
    <div className="flex items-center gap-1.5">
      <button
        className="grid size-[30px] place-items-center rounded-full border border-line bg-white text-tx hover:bg-muted disabled:text-tx3"
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
        disabled={!state}
        onClick={playing ? clock.pause : clock.play}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span role="timer" aria-label="Time" className="min-w-[96px] font-mono text-xs text-tx2 tabular-nums">
        {formatTime(state?.time ?? 0)} / {formatTime(state?.length ?? 0)}
      </span>
    </div>
  )
}
