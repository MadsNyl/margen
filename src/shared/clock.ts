// An Animation video's clock: Margen holds every animation on the page at one
// time, in seconds from the start of the video. The page script drives it
// (`src/preload/document.ts`); the editor plays, pauses and seeks it over the
// Document bridge. Times on the bridge, in Annotations and in the prompt are seconds.

/**
 * The video's length: when the last animation ends, or the narration (`narrationEnd` in seconds, spoken with
 * the video's Voice), whichever is later. `ends` are each animation's end time in ms
 * (`getComputedTiming().endTime`); those that never end don't count.
 */
export function videoLength(ends: readonly number[], narrationEnd = 0): number {
  const finite = ends.filter((end) => Number.isFinite(end) && end > 0)
  return Math.max(finite.length ? Math.max(...finite) / 1000 : 0, narrationEnd)
}

/** A time as the timer and the prompt show it: `m:ss.s`, as in 0:12.4. */
export function formatTime(seconds: number): string {
  const tenths = Math.round(Math.max(0, seconds) * 10)
  const minutes = Math.floor(tenths / 600)
  const rest = tenths - minutes * 600
  return `${minutes}:${String(Math.floor(rest / 10)).padStart(2, '0')}.${rest % 10}`
}
