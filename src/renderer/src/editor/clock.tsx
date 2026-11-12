import { createContext, useContext, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
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
  /** The time last seeked to, until the page answers that seek: what the time bar shows meanwhile. */
  seeking?: number
  /** From where it is, or from `time`. */
  play(time?: number): void
  pause(): void
  /** Pauses at `time`. */
  seek(time: number): void
}

/**
 * The clock of the Document open at `url` while it's an Animation video (`video`); `null` while it isn't.
 * `narrationEnd` is when its narration ends, spoken with its Voice: the video runs on until then.
 */
export function useVideoClock(bridge: DocumentBridge | null, video: boolean, url: string, narrationEnd: number): VideoClock | null {
  const [state, setState] = useState<{ url: string; clock: ClockState }>()
  /** Where the clock last was, kept across the page's reloads. */
  const kept = useRef<{ url: string; time: number } | null>(null)
  const seeks = useRef(0)
  const [seeking, setSeeking] = useState<{ bridge: DocumentBridge; id: string; time: number }>()
  const last = useRef(seeking)

  // Before the restore below as the page (re)loads, so a time past the last animation but within the narration is kept.
  useEffect(() => {
    if (bridge && video) bridge.send({ type: 'clock-narration', end: narrationEnd })
  }, [bridge, video, narrationEnd])

  useEffect(() => {
    if (!bridge || !video) return
    const time = kept.current?.url === url ? kept.current.time : 0
    // Until the seek is answered, what the newly loaded page says (paused at 0) isn't where the video is.
    let restoring = true
    const off = bridge.on((message) => {
      if (message.type !== 'clock' || (restoring && message.id !== RESTORE)) return
      restoring = false
      if (message.id && message.id === last.current?.id) {
        last.current = undefined
        setSeeking(undefined)
      }
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
    // A page that reloaded before answering never will.
    ...(seeking && seeking.bridge === bridge && { seeking: seeking.time }),
    play: (time) => bridge?.send({ type: 'clock-play', ...(time !== undefined && { time }) }),
    pause: () => bridge?.send({ type: 'clock-pause' }),
    seek: (time) => {
      if (!bridge) return
      const id = `seek-${++seeks.current}`
      last.current = { bridge, id, time }
      setSeeking(last.current)
      bridge.send({ type: 'clock-seek', time, id })
    },
  }
}

/** Two frames while playing that the time bar shows the same. A paused clock is always taken as it is. */
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

/** The time bar's height and its gap above, under the video's frame: the frame is fitted to the room left. */
export const TIME_BAR_ROOM = 30 + 10

/** One frame of the video, at the export's 30 fps: what ← and → nudge by (⇧: a second). */
const FPS = 30
const FRAME = 1 / FPS

/**
 * The time bar under an Animation video, as wide as its frame: play/pause, the timer, the scrub track
 * (`marks` are the narration lines' starts) and, on the right, `children` (the Voice select).
 */
export function TimeBar({ clock, marks, children }: { clock: VideoClock; marks: readonly number[]; children: ReactNode }) {
  const { state } = clock
  const playing = state?.playing ?? false
  const length = state?.length ?? 0
  const scrub = useScrub(clock)
  // Until the page answers, the time asked for, so a drag or a held arrow key doesn't lag behind the page.
  const time = clock.seeking ?? state?.time ?? 0
  const at = (t: number) => `${length > 0 ? Math.min(100, (t / length) * 100) : 0}%`

  return (
    <div
      role="group"
      aria-label="Time bar"
      className="flex h-[30px] w-full items-center gap-2.5 rounded-full bg-white pr-0.5 pl-0.5 shadow-[0_0_0_1px_rgba(0,0,0,.06),0_6px_16px_-10px_rgba(0,0,0,.2)]"
    >
      <button
        className="grid size-[26px] flex-none place-items-center rounded-full text-tx hover:bg-muted disabled:text-tx3"
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
        disabled={!state}
        onClick={playing ? clock.pause : () => clock.play()}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span role="timer" aria-label="Time" className="flex-none font-mono text-[11.5px] text-tx2 tabular-nums">
        {formatTime(time)} <span className="text-tx3">/ {formatTime(length)}</span>
      </span>
      <div
        role="slider"
        tabIndex={state ? 0 : -1}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={length}
        aria-valuenow={time}
        aria-valuetext={formatTime(time)}
        aria-disabled={!state}
        className="group relative h-full min-w-0 flex-1 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        onPointerDown={(event) => {
          if (!state || event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          event.currentTarget.focus()
          scrub.start(timeAt(event), playing)
        }}
        onPointerMove={(event) => scrub.dragging && scrub.move(timeAt(event))}
        onPointerUp={() => scrub.end()}
        onPointerCancel={() => scrub.end()}
        onKeyDown={(event) => {
          if (!state || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
          event.preventDefault()
          const step = (event.shiftKey ? 1 : FRAME) * (event.key === 'ArrowLeft' ? -1 : 1)
          clock.seek(Math.max(0, Math.min(length, onFrame(time + step))))
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-muted2">
          <div className="h-full bg-tx" style={{ width: at(time) }} />
        </div>
        {marks.map((start, i) => (
          <span
            key={i}
            data-line-start={start}
            aria-hidden
            className={`pointer-events-none absolute top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2 ${start <= time ? 'bg-white/80' : 'bg-tx3/70'}`}
            style={{ left: at(start) }}
          />
        ))}
        <span
          aria-hidden
          className={`pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/15 bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)] transition-transform group-hover:scale-110 ${scrub.dragging ? 'scale-110' : ''}`}
          style={{ left: at(time) }}
        />
      </div>
      {children}
    </div>
  )

  /** The time under the pointer, along the track. */
  function timeAt(event: PointerEvent<HTMLElement>): number {
    const track = event.currentTarget.getBoundingClientRect()
    return Math.min(length, onFrame(Math.max(0, Math.min(1, (event.clientX - track.left) / track.width)) * length))
  }
}

/** The whole frame nearest `time`: the track seeks to the times an export draws. */
const onFrame = (time: number) => Math.round(time * FPS) / FPS

/** Seeking from the track. Dragging pauses and seeks live (the narration stops with the clock); letting go stays paused, or plays on from there if it was playing. */
function useScrub(clock: VideoClock) {
  const held = useRef<{ playing: boolean; time: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  return {
    dragging,
    start(time: number, playing: boolean) {
      held.current = { playing, time }
      setDragging(true)
      clock.seek(time)
    },
    move(time: number) {
      if (held.current) held.current.time = time
      clock.seek(time)
    },
    end() {
      const was = held.current
      if (!was) return
      held.current = null
      setDragging(false)
      if (was.playing) clock.play(was.time)
    },
  }
}
