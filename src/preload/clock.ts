/// <reference lib="dom" />
import { videoLength } from '@shared/clock'
import type { ClockState } from '@shared/document-bridge'

// An Animation video's clock, inside the page (`src/shared/clock.ts`). Margen
// takes every animation on the page (Web Animations: `document.getAnimations()`),
// pauses it, and sets them all to one time. Playing doesn't hand them back: each
// frame sets them all to the time since play, so they stay on the one clock,
// and so do any the page makes later.

export interface Clock {
  play(time?: number): void
  pause(): void
  seek(time: number, id?: string): void
}

/** Takes the page's clock, paused at 0, and reports it with `report` whenever it changes. */
export function takeClock(report: (clock: ClockState, id?: string) => void): Clock {
  /** Held on to, since an animation that has ended without filling drops out of `getAnimations()`. */
  const held = new Set<Animation>()
  let time = 0
  let playing: { from: number; at: number } | null = null
  let loop = 0

  function hold() {
    for (const animation of document.getAnimations()) held.add(animation)
    // A cancelled one (its CSS is gone) stays cancelled.
    for (const animation of held) if (animation.playState === 'idle') held.delete(animation)
  }

  function length() {
    return videoLength([...held].map((animation) => Number(animation.effect?.getComputedTiming().endTime ?? 0)))
  }

  function apply() {
    hold()
    for (const animation of held) {
      animation.pause()
      animation.currentTime = time * 1000
    }
  }

  function frame() {
    const stage = document.querySelector<HTMLElement>('.stage')
    const root = document.documentElement
    return stage ? { width: stage.offsetWidth, height: stage.offsetHeight } : { width: root.scrollWidth, height: root.scrollHeight }
  }

  const send = (id?: string) => report({ time, length: length(), playing: playing !== null, frame: frame() }, id)

  function stop() {
    playing = null
    cancelAnimationFrame(loop)
  }

  function tick() {
    if (!playing) return
    hold()
    const end = length()
    time = playing.from + (performance.now() - playing.at) / 1000
    if (time >= end) {
      time = end
      stop()
    }
    apply()
    send()
    if (playing) loop = requestAnimationFrame(tick)
  }

  // Stylesheets and fonts that arrive late can add animations; hold them at the time too.
  const settle = () => {
    if (playing) return
    apply()
    send()
  }
  window.addEventListener('load', settle, { once: true })
  void document.fonts?.ready.then(settle)

  apply()
  send()

  return {
    play(from) {
      stop()
      hold()
      const start = from ?? time
      time = start >= length() ? 0 : Math.max(0, start)
      playing = { from: time, at: performance.now() }
      tick()
    },
    pause() {
      if (!playing) return
      time = Math.min(playing.from + (performance.now() - playing.at) / 1000, length())
      stop()
      apply()
      send()
    },
    seek(to, id) {
      stop()
      hold()
      const end = length()
      time = Math.max(0, end > 0 ? Math.min(to, end) : to)
      apply()
      // Answered once the frame has been drawn, so whoever asked can capture it.
      requestAnimationFrame(() => requestAnimationFrame(() => send(id)))
    },
  }
}
