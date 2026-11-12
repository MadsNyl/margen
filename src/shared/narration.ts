import { TEMPLATE_META, attribute } from './templates'

// An Animation video's narration: the lines in its
// `<script type="application/json" id="narration">` block, each spoken with
// the video's Voice from its start time. Pure, so main (speaking, the export,
// the Agent's line-length tool) and the renderer read it the same way.

export interface NarrationLine {
  /** Seconds from the start of the video. */
  start: number
  text: string
}

export interface Narration {
  /** In order of their start. */
  lines: NarrationLine[]
  /** What's wrong with the block, when something is: the lines that could be read still play. */
  problem?: string
}

/** The narration block's lines. A block that can't be read is reported in `problem`, never thrown. */
export function parseNarration(html: string): Narration {
  const block = narrationBlock(html)
  if (block === undefined) return { lines: [] }
  let value: unknown
  try {
    value = JSON.parse(block)
  } catch (error) {
    return { lines: [], problem: `The narration block isn’t valid JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (!Array.isArray(value)) return { lines: [], problem: 'The narration block must be a list of lines.' }
  const lines: NarrationLine[] = []
  const skipped: number[] = []
  value.forEach((item: unknown, i) => {
    const { start, text } = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>
    if (typeof start === 'number' && Number.isFinite(start) && start >= 0 && typeof text === 'string' && text.trim()) {
      lines.push({ start, text: text.trim() })
    } else skipped.push(i + 1)
  })
  lines.sort((a, b) => a.start - b.start)
  if (!skipped.length) return { lines }
  return {
    lines,
    problem: `Narration ${skipped.length === 1 ? 'line' : 'lines'} ${list(skipped)} ${skipped.length === 1 ? 'needs' : 'need'} a "start" in seconds (0 or more) and a "text"; ${skipped.length === 1 ? 'it was' : 'they were'} skipped.`,
  }
}

/** The text inside the first `<script id="narration">`, if there is one. */
function narrationBlock(html: string): string | undefined {
  for (const [, attrs = '', body = ''] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attribute(` ${attrs}`, 'id') === 'narration') return body
  }
  return undefined
}

function list(numbers: number[]): string {
  return numbers.length === 1 ? String(numbers[0]) : `${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`
}

export const VOICE_META = 'margen-voice'

/** The `<meta name="margen-voice">` tags in `html`, with where each starts. */
function voiceTags(html: string): RegExpExecArray[] {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].filter(([tag]) => attribute(tag, 'name')?.toLowerCase() === VOICE_META)
}

/** The video's Voice, as `<meta name="margen-voice" content="kokoro/af_heart">` names it. */
export function voiceMarker(html: string): string | undefined {
  for (const [tag] of voiceTags(html)) {
    const content = attribute(tag, 'content')?.trim()
    if (content) return content
  }
  return undefined
}

/**
 * `html` with its Voice marker set to `voice` (a Voice id, which needs no escaping), or removed for `null`.
 * A new marker goes on the line after the Template marker, else at the top of `<head>`; nothing else changes.
 */
export function withVoiceMarker(html: string, voice: string | null): string {
  const tag = voice === null ? '' : `<meta name="${VOICE_META}" content="${voice}">`
  const [existing] = voiceTags(html)
  if (existing) {
    const at = existing.index
    if (tag) return html.slice(0, at) + tag + html.slice(at + existing[0].length)
    // With the line break and indent in front of it, so its line goes too.
    const before = /\r?\n[ \t]*$/.exec(html.slice(0, at))
    return html.slice(0, before ? before.index : at) + html.slice(at + existing[0].length)
  }
  if (!tag) return html
  const template = [...html.matchAll(/<meta\b[^>]*>/gi)].find(([meta]) => attribute(meta, 'name')?.toLowerCase() === TEMPLATE_META)
  const after = template ?? /<head\b[^>]*>/i.exec(html)
  if (!after) return `${tag}\n${html}`
  const end = after.index + after[0].length
  return `${html.slice(0, end)}\n${tag}${html.slice(end)}`
}

/** When each line plays, playing the video from `time`: `delay` from now, `offset` into the line's audio. */
export interface ScheduledLine {
  index: number
  delay: number
  offset: number
}

/**
 * The lines still to be heard playing from `time` (seconds), given each line's start and spoken length.
 * A line `time` falls inside plays at once from partway; `undefined` (not spoken yet) is skipped.
 */
export function narrationSchedule(lines: readonly ({ start: number; duration: number } | undefined)[], time: number): ScheduledLine[] {
  return lines.flatMap((line, index) =>
    line && line.start + line.duration > time ? [{ index, delay: Math.max(0, line.start - time), offset: Math.max(0, time - line.start) }] : [],
  )
}
