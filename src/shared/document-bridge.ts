// The Document bridge: messages between the editor (the renderer) and Margen's
// script inside the Document view (`src/preload/document.ts`). The script runs in
// an isolated world, so the page's own scripts can neither see nor send these.
// It goes to the editor with `ipcRenderer.sendToHost`; the editor answers with
// `webview.send`. Both use one channel. Pick, Draw and screenshots (12–14) add
// message types here.
//
// Geometry is in the page's CSS pixels, relative to its viewport, which is the
// Document view's frame. The editor follows elements by an `id`: the script
// holds the element itself while the page lives and finds it again by its
// selector after a reload.

import type { Box, ElementDescriptor, Point } from './agent'
import type { MarkedTemplateId } from './templates'

export const DOCUMENT_BRIDGE_CHANNEL = 'margen:document'

/** The Document view's session: its own cookies and storage, apart from Margen's, and the only one serving margen-doc://. */
export const DOCUMENT_PARTITION = 'persist:margen-doc'

/** Where the page is scrolled to, in CSS pixels. */
export interface ScrollPosition {
  x: number
  y: number
}

/** The active tool on the floating toolbar. In Pick and Draw the page's own clicks are blocked. */
export type Mode = 'browse' | 'pick' | 'draw'

/** Shortcut keys the page's script passes on while the page has focus (and the user isn't typing in it). */
export const MODE_KEYS = ['v', 'p', 'd', 'Escape'] as const
export type ModeKey = (typeof MODE_KEYS)[number]

/** Arrow-key Pick (13): the arrows move the highlight, ⇧← ⇧→ skip to the previous or next sibling, ↵ picks. */
export const PICK_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PreviousSibling', 'NextSibling', 'Enter'] as const
export type PickKey = (typeof PICK_KEYS)[number]

/** The Pick key a keydown means, or null. Shift turns ← → into sibling skips and leaves the other keys alone. */
export function pickKeyOf(event: { key: string; shiftKey: boolean }): PickKey | null {
  if (event.shiftKey && event.key === 'ArrowLeft') return 'PreviousSibling'
  if (event.shiftKey && event.key === 'ArrowRight') return 'NextSibling'
  if (event.shiftKey) return null
  return (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'] as const).find((key) => key === event.key) ?? null
}

/** A text edit made by hand: the element (its CSS path) and its plain text before and after. */
export interface TextEdit {
  selector: string
  before: string
  after: string
}

/** The longest text a hand edit may carry. */
const TEXT_EDIT_MAX = 20_000

/** An element the editor follows (a marker, a glow), and how to find it again after a reload. */
export interface TrackedElement {
  id: string
  selector: string
}

/**
 * An Animation video's clock (`src/shared/clock.ts`), as the page's script holds it.
 * Times are seconds from the start of the video.
 */
export interface ClockState {
  time: number
  /** When the last animation ends. */
  length: number
  playing: boolean
  /** The video's frame: the `.stage`'s size in CSS px (or the page's, without one). */
  frame: { width: number; height: number }
}

/** From the page's script to the editor. */
export type FromDocument =
  /** The page's DOM is ready and the script is listening. */
  | { type: 'ready'; url: string; template?: MarkedTemplateId }
  /** The user scrolled the page (throttled). */
  | { type: 'scroll'; scroll: ScrollPosition }
  /** In Pick: the element the highlight is on, or `null` when it's on nothing. `byKey`: moved there with the arrow keys. */
  | { type: 'hover'; target: { selector: string; rect: Box } | null; byKey?: boolean }
  /** In Pick: the user picked an element. The script follows it as `id` until the next `track` leaves it out. */
  | { type: 'pick'; id: string; element: ElementDescriptor; rect: Box }
  /** Where the followed elements are now, sent when any of them moves. `null`: not on the page. */
  | { type: 'rects'; rects: Record<string, Box | null> }
  /** A shortcut key, pressed while the page had focus. */
  | { type: 'key'; key: ModeKey }
  /** Where the page is scrolled to, every frame it changes: strokes are in page coordinates, the overlay in the viewport's. */
  | { type: 'view'; scroll: ScrollPosition }
  /** In Draw: the stroke being drawn (page coordinates) and the boxes of what it catches so far. */
  | { type: 'stroke-live'; points: Point[]; rects: Box[] }
  /** In Draw: the user let go of a stroke (page coordinates). */
  | { type: 'stroke'; points: Point[] }
  /** The answer to `resolve`: what the drawing's strokes caught. The script follows target `i` as `<id>/<i>` at once. */
  | { type: 'drawing'; id: string; targets: ElementDescriptor[]; rects: Box[] }
  /** In Browse: the user double-clicked an element's plain text, changed it and pressed ↵ (or clicked away). */
  | ({ type: 'text-edit' } & TextEdit)
  /**
   * On an Animation video: where its clock is. Sent once the script takes the clock (paused at 0),
   * every frame while playing, on pause, and once a seek's frame has been drawn (with the seek's `id`).
   */
  | { type: 'clock'; clock: ClockState; id?: string }

/** From the editor to the page's script. */
export type ToDocument =
  /** Scroll back to where the page was before a reload, and hold it while late layout (fonts, images) settles. */
  | { type: 'restore-scroll'; scroll: ScrollPosition }
  | { type: 'mode'; mode: Mode }
  /** The elements to follow (replacing the last list); their rects come back as `rects`. */
  | { type: 'track'; elements: TrackedElement[] }
  /** Resolve a drawing's strokes (page coordinates) to the elements they caught; answered with `drawing`. */
  | { type: 'resolve'; id: string; strokes: Point[][] }
  /** The last text edit couldn't be saved: put the text back as it was. */
  | { type: 'text-edit-failed' }
  /** In Pick: an arrow or ↵ pressed in the editor while the page didn't have focus. */
  | { type: 'key'; key: PickKey }
  /** On an Animation video: play from `time`, or from where it's paused (from 0 once it has ended). */
  | { type: 'clock-play'; time?: number }
  | { type: 'clock-pause' }
  /** On an Animation video: pause at `time` (kept within the video). Answered with `clock`, carrying `id`, once that frame is drawn. */
  | { type: 'clock-seek'; time: number; id?: string }
  /**
   * From the main process to the offscreen copy of the page it exports (`src/main/video-frames.ts`),
   * which has no editor: from now on the script sends its messages to the main process instead.
   */
  | { type: 'export' }

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isScroll = (value: unknown): value is ScrollPosition =>
  typeof value === 'object' && value !== null && isNumber((value as ScrollPosition).x) && isNumber((value as ScrollPosition).y)

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isString = (value: unknown, max = 10_000): value is string => typeof value === 'string' && value.length <= max

function box(value: unknown): Box | null {
  if (!isObject(value)) return null
  const { x, y, width, height } = value
  return isNumber(x) && isNumber(y) && isNumber(width) && isNumber(height) ? { x, y, width, height } : null
}

function descriptor(value: unknown): ElementDescriptor | null {
  if (!isObject(value)) return null
  const { selector, tag, html, text } = value
  if (!isString(selector, 2000) || !isString(tag, 100) || !isString(html, 2000)) return null
  if (text !== undefined && !isString(text, 2000)) return null
  return { selector, tag, html, ...(text !== undefined && { text }) }
}

const MAX_POINTS = 10_000

function pointsOf(value: unknown): Point[] | null {
  if (!Array.isArray(value) || value.length > MAX_POINTS) return null
  const points = value.map((p) => (isScroll(p) ? { x: p.x, y: p.y } : null))
  return points.every((p) => p !== null) ? (points as Point[]) : null
}

function boxesOf(value: unknown): Box[] | null {
  if (!Array.isArray(value) || value.length > 100) return null
  const boxes = value.map(box)
  return boxes.every((b) => b !== null) ? (boxes as Box[]) : null
}

/** Checks a message that claims to come from the page. Never trust what arrives from the guest unchecked. */
export function parseFromDocument(value: unknown): FromDocument | null {
  if (!isObject(value)) return null
  const message = value
  if (message.type === 'ready' && typeof message.url === 'string') {
    return { type: 'ready', url: message.url, ...(message.template === 'animation-video' && { template: message.template }) }
  }
  if (message.type === 'scroll' && isScroll(message.scroll)) return { type: 'scroll', scroll: { x: message.scroll.x, y: message.scroll.y } }
  if (message.type === 'hover') {
    if (message.target === null) return { type: 'hover', target: null }
    const target = message.target
    const rect = isObject(target) ? box(target.rect) : null
    const byKey = message.byKey === true && { byKey: true }
    return rect && isObject(target) && isString(target.selector, 2000) ? { type: 'hover', target: { selector: target.selector, rect }, ...byKey } : null
  }
  if (message.type === 'pick') {
    const element = descriptor(message.element)
    const rect = box(message.rect)
    return element && rect && isString(message.id, 100) ? { type: 'pick', id: message.id, element, rect } : null
  }
  if (message.type === 'rects' && isObject(message.rects)) {
    const rects: Record<string, Box | null> = {}
    for (const [id, rect] of Object.entries(message.rects)) {
      if (rect !== null && !box(rect)) return null
      rects[id] = rect === null ? null : box(rect)
    }
    return { type: 'rects', rects }
  }
  if (message.type === 'view' && isScroll(message.scroll)) return { type: 'view', scroll: { x: message.scroll.x, y: message.scroll.y } }
  if (message.type === 'stroke-live') {
    const points = pointsOf(message.points)
    const rects = boxesOf(message.rects)
    return points && rects ? { type: 'stroke-live', points, rects } : null
  }
  if (message.type === 'stroke') {
    const points = pointsOf(message.points)
    return points ? { type: 'stroke', points } : null
  }
  if (message.type === 'drawing' && isString(message.id, 100) && Array.isArray(message.targets) && message.targets.length <= 5) {
    const targets = message.targets.map(descriptor)
    const rects = boxesOf(message.rects)
    if (!rects || rects.length !== targets.length || targets.some((target) => target === null)) return null
    return { type: 'drawing', id: message.id, targets: targets as ElementDescriptor[], rects }
  }
  if (message.type === 'key' && MODE_KEYS.includes(message.key as ModeKey)) return { type: 'key', key: message.key as ModeKey }
  if (message.type === 'text-edit' && isString(message.selector, 2000) && isString(message.before, TEXT_EDIT_MAX) && isString(message.after, TEXT_EDIT_MAX)) {
    return { type: 'text-edit', selector: message.selector, before: message.before, after: message.after }
  }
  if (message.type === 'clock' && isObject(message.clock) && (message.id === undefined || isString(message.id, 100))) {
    const { time, length, playing, frame } = message.clock
    if (!isNumber(time) || !isNumber(length) || typeof playing !== 'boolean' || !isObject(frame) || !isNumber(frame.width) || !isNumber(frame.height)) return null
    const clock = { time, length, playing, frame: { width: frame.width, height: frame.height } }
    return { type: 'clock', clock, ...(message.id !== undefined && { id: message.id }) }
  }
  return null
}
