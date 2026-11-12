/// <reference lib="dom" />
import { ipcRenderer } from 'electron'
import type { Box, Point } from '@shared/agent'
import {
  DOCUMENT_BRIDGE_CHANNEL,
  MODE_KEYS,
  pickKeyOf,
  type FromDocument,
  type Mode,
  type ModeKey,
  type PickKey,
  type ScrollPosition,
  type ToDocument,
  type TrackedElement,
} from '@shared/document-bridge'
import { resolveDrawing, resolveStroke, type Layout } from '@shared/draw'
import { arrowTarget, type ArrowKey } from './arrows'
import { describeElement, findElement, rectOf, selectorOf } from './elements'

// Margen's script inside the Document view. It is the `<webview>`'s preload, so it
// runs in an isolated world: it sees the page's DOM but not its globals, and the
// page can't see it. Nothing is written into the page or the file on disk. It
// talks to the editor over the Document bridge (`src/shared/document-bridge.ts`).

const SCROLL_REPORT_MS = 100
/** How long a restored scroll position is held while late layout (images, fonts) settles. */
const RESTORE_HOLD_MS = 2500

const send = (message: FromDocument) => ipcRenderer.sendToHost(DOCUMENT_BRIDGE_CHANNEL, message)
const position = (): ScrollPosition => ({ x: window.scrollX, y: window.scrollY })

// While a scroll position is being restored, the page's own scroll events are ours, not the user's.
let restoring: ScrollPosition | null = null
let reportTimer: ReturnType<typeof setTimeout> | undefined
let holdTimer: ReturnType<typeof setTimeout> | undefined

function report() {
  if (restoring || reportTimer) return
  reportTimer = setTimeout(() => {
    reportTimer = undefined
    if (!restoring) send({ type: 'scroll', scroll: position() })
  }, SCROLL_REPORT_MS)
}

function restore(scroll: ScrollPosition) {
  restoring = scroll
  const apply = () => {
    if (restoring) window.scrollTo(restoring.x, restoring.y)
  }
  apply()
  window.addEventListener('load', apply, { once: true })
  void document.fonts?.ready.then(apply)
  clearTimeout(holdTimer)
  holdTimer = setTimeout(stopRestoring, RESTORE_HOLD_MS)
}

function stopRestoring() {
  if (!restoring) return
  clearTimeout(holdTimer)
  restoring = null
  report()
}

// The user taking over ends a restore at once.
for (const event of ['wheel', 'keydown', 'pointerdown', 'touchstart'] as const) {
  window.addEventListener(event, stopRestoring, { capture: true, passive: true })
}
window.addEventListener('scroll', report, { passive: true })

// The editor draws strokes in page coordinates over the view, so it needs the scroll at once, not throttled.
let viewFrame = 0
window.addEventListener(
  'scroll',
  () => {
    viewFrame ||= requestAnimationFrame(() => {
      viewFrame = 0
      send({ type: 'view', scroll: position() })
    })
  },
  { passive: true },
)

// Modes. In Pick (and Draw) the page's own clicks, presses and drags are
// blocked: these listeners are on window in the capture phase and were added
// before any of the page's scripts ran, so they go first and stop the rest.

let mode: Mode = 'browse'
const BLOCKED = [
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup',
  'touchstart',
  'touchend',
  'dragstart',
  'submit',
] as const

const isElement = (target: EventTarget | null): target is Element => (target as Node | null)?.nodeType === Node.ELEMENT_NODE
const editable = (target: EventTarget | null) =>
  isElement(target) && target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]') !== null

for (const type of BLOCKED) {
  window.addEventListener(
    type,
    (event) => {
      if (mode === 'browse') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (mode === 'pick' && event.type === 'click' && isElement(event.target)) pick(event.target)
      if (mode === 'draw' && event.type === 'pointerdown') startStroke(event as PointerEvent)
      if (mode === 'draw' && event.type === 'pointerup') endStroke()
    },
    { capture: true },
  )
}

window.addEventListener(
  'keydown',
  (event) => {
    if (textEdit && editKey(event)) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const pickKeyPressed = mode === 'pick' && !editable(event.target) ? pickKeyOf(event) : null
    if (pickKeyPressed) {
      event.preventDefault()
      event.stopImmediatePropagation()
      pickKey(pickKeyPressed)
      return
    }
    const key = event.key === 'Escape' ? 'Escape' : event.key.toLowerCase()
    if (!MODE_KEYS.includes(key as ModeKey) || (key !== 'Escape' && editable(event.target))) return
    send({ type: 'key', key: key as ModeKey })
    if (mode !== 'browse') {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  },
  { capture: true },
)

/** Pick shows a plain arrow rather than the page's own pointers, Draw a pen. Adopted, so nothing is written into the page. */
function cursorSheet(cursor: string) {
  try {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(`*, *::before, *::after { cursor: ${cursor} !important }`)
    return sheet
  } catch {
    return null
  }
}
const PEN =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22'%3E%3Ccircle cx='3' cy='19' r='2.5' fill='%232f7bff'/%3E%3Cpath d='M5 17L18 4l2 2L7 19' fill='white' stroke='%232f7bff' stroke-width='1.4'/%3E%3C/svg%3E") 3 19, crosshair`
const cursors: Partial<Record<Mode, CSSStyleSheet | null>> = { pick: cursorSheet('default'), draw: cursorSheet(PEN) }

function setMode(next: Mode) {
  if (textEdit) finishTextEdit(true)
  mode = next
  const ours = Object.values(cursors)
  const others = document.adoptedStyleSheets.filter((sheet) => !ours.includes(sheet))
  const cursor = cursors[mode]
  document.adoptedStyleSheets = cursor ? [...others, cursor] : others
  if (mode !== 'pick') hovered = null
  if (mode !== 'draw') stroke = null
  byKey = false
  watch()
}

// Browse: double-click an element's plain text to change it by hand. It
// becomes editable in place, outlined in the accent; ↵ or clicking away saves,
// Esc puts it back. Saving goes to the editor as a `text-edit`, which writes
// the file; the reload that follows shows the saved text.

interface TextEditing {
  element: HTMLElement
  before: string
  /** What the element's own attribute and outline were, to put back. */
  editable: string | null
  outline: string
  outlineOffset: string
}

let textEdit: TextEditing | null = null
/** The last edit sent, so a failed save can put its text back. */
let lastEdit: { element: HTMLElement; before: string } | null = null

/** Text a hand edit can change: an element with only text inside, not a link, button or form control. */
function plainText(element: Element): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.children.length === 0 &&
    (element.textContent ?? '').trim() !== '' &&
    element.closest('a, button, label, input, textarea, select, option, script, style, [contenteditable]:not([contenteditable="false"])') === null
  )
}

window.addEventListener(
  'dblclick',
  (event) => {
    if (mode !== 'browse' || textEdit || !isElement(event.target) || !plainText(event.target)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    startTextEdit(event.target, event.clientX, event.clientY)
  },
  { capture: true },
)

function startTextEdit(element: HTMLElement, x: number, y: number) {
  textEdit = {
    element,
    before: element.textContent ?? '',
    editable: element.getAttribute('contenteditable'),
    outline: element.style.outline,
    outlineOffset: element.style.outlineOffset,
  }
  element.setAttribute('contenteditable', 'plaintext-only')
  element.style.outline = '2px solid #2f7bff'
  element.style.outlineOffset = '3px'
  element.focus({ preventScroll: true })
  // The caret goes where the double-click was.
  const caret = document.caretRangeFromPoint(x, y)
  const selection = window.getSelection()
  if (caret && selection) {
    selection.removeAllRanges()
    selection.addRange(caret)
  }
  element.addEventListener('blur', onTextEditBlur, { once: true })
}

function onTextEditBlur() {
  if (textEdit) finishTextEdit(true)
}

/** ↵ saves and Esc cancels; every other key just types. True when the key was the edit's. */
function editKey(event: KeyboardEvent): boolean {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) finishTextEdit(true)
  else if (event.key === 'Escape') finishTextEdit(false)
  else return false
  event.preventDefault()
  event.stopImmediatePropagation()
  return true
}

function finishTextEdit(save: boolean) {
  const editing = textEdit
  if (!editing) return
  textEdit = null
  const { element, before } = editing
  element.removeEventListener('blur', onTextEditBlur)
  if (editing.editable === null) element.removeAttribute('contenteditable')
  else element.setAttribute('contenteditable', editing.editable)
  element.style.outline = editing.outline
  element.style.outlineOffset = editing.outlineOffset
  window.getSelection()?.removeAllRanges()
  const after = element.textContent ?? ''
  if (!save || after.trim() === '' || after.replace(/\s+/g, ' ').trim() === before.replace(/\s+/g, ' ').trim()) {
    element.textContent = before
    return
  }
  lastEdit = { element, before }
  send({ type: 'text-edit', selector: selectorOf(element), before, after })
}

// Pick: the highlight follows the mouse; a click picks.

let hovered: Element | null = null
/** Whether the highlight got where it is by the arrow keys (the editor shows the key guide). */
let byKey = false
let picks = 0
let pointer = { x: NaN, y: NaN }

window.addEventListener(
  'pointermove',
  (event) => {
    if (mode === 'draw') moveStroke(event)
    // Only a real move takes the highlight back from the keys, not the page scrolling under a still mouse.
    const moved = event.clientX !== pointer.x || event.clientY !== pointer.y
    pointer = { x: event.clientX, y: event.clientY }
    if (mode !== 'pick' || !isElement(event.target) || (event.target === hovered && !byKey) || !moved) return
    hovered = event.target
    byKey = false
    watch()
  },
  { capture: true, passive: true },
)
window.addEventListener('mouseout', (event) => {
  if (mode === 'pick' && !event.relatedTarget) {
    hovered = null
    watch()
  }
})

/** Arrow-key Pick: ← → walk every visible element in document order, ⇧← ⇧→ skip by sibling, ↑ parent, ↓ first child, ↵ picks. */
function pickKey(key: PickKey) {
  if (key === 'Enter') {
    if (hovered?.isConnected) pick(hovered)
    return
  }
  const from = hovered?.isConnected ? hovered : null
  const next = arrowTarget<Element>(document.body, from, key as ArrowKey, visible)
  if (!next) return
  hovered = next
  byKey = true
  next.scrollIntoView({ block: 'nearest' })
  watch()
}

function visible(element: Element): boolean {
  const { width, height } = element.getBoundingClientRect()
  return width > 0 && height > 0 && element.checkVisibility({ visibilityProperty: true })
}

function pick(element: Element) {
  const id = `pick-${++picks}`
  followed.set(id, { selector: selectorOf(element), element })
  send({ type: 'pick', id, element: describeElement(element), rect: rectOf(element) })
  watch()
}

// Draw: a stroke follows the pointer while it's down, lighting up what it
// catches; on release it goes to the editor, which asks back (`resolve`) what
// the whole drawing caught. Points and boxes are in page coordinates here.

let stroke: { points: Point[]; layout: Layout<Element> } | null = null
let strokeFrame = 0
/** Fewer points than this make a click or a slip, not a stroke. */
const LIVE_POINTS = 6

const pagePoint = (event: PointerEvent): Point => ({ x: event.clientX + window.scrollX, y: event.clientY + window.scrollY })
const toView = ({ x, y, width, height }: Box): Box => ({ x: x - window.scrollX, y: y - window.scrollY, width, height })

/** The page's elements and their boxes in page coordinates, as they are now. `<body>` and above are never caught. */
function pageLayout(): Layout<Element> {
  const boxes = new Map<Element, Box>()
  for (const element of document.body?.querySelectorAll('*') ?? []) {
    const { x, y, width, height } = rectOf(element)
    if (width > 0 && height > 0) boxes.set(element, { x: x + window.scrollX, y: y + window.scrollY, width, height })
  }
  return {
    elements: [...boxes.keys()],
    box: (element) => boxes.get(element) ?? { x: 0, y: 0, width: 0, height: 0 },
    parent: (element) => (element.parentElement && element.parentElement !== document.body ? element.parentElement : null),
  }
}

function startStroke(event: PointerEvent) {
  if (event.button !== 0) return
  stroke = { points: [pagePoint(event)], layout: pageLayout() }
  try {
    document.documentElement.setPointerCapture(event.pointerId)
  } catch {
    // Not every pointer can be captured; the stroke still works inside the page.
  }
}

function moveStroke(event: PointerEvent) {
  if (!stroke) return
  stroke.points.push(pagePoint(event))
  strokeFrame ||= requestAnimationFrame(() => {
    strokeFrame = 0
    if (!stroke) return
    const caught = stroke.points.length < LIVE_POINTS ? [] : resolveStroke(stroke.points, stroke.layout)
    send({ type: 'stroke-live', points: stroke.points, rects: caught.map((element) => toView(stroke?.layout.box(element) ?? rectOf(element))) })
  })
}

function endStroke() {
  if (!stroke) return
  const { points } = stroke
  stroke = null
  send({ type: 'stroke', points })
}
window.addEventListener('pointercancel', endStroke, { capture: true })

function resolve(id: string, strokes: Point[][]) {
  const targets = resolveDrawing(strokes, pageLayout())
  targets.forEach((element, i) => followed.set(`${id}/${i}`, { selector: selectorOf(element), element }))
  send({ type: 'drawing', id, targets: targets.map(describeElement), rects: targets.map(rectOf) })
  watch()
}

// Following elements: each frame while there's anything to follow, the hover
// and the followed elements' boxes go to the editor when they've changed.

let followed = new Map<string, { selector: string; element: Element | null }>()
let sentHover = '[null,false]'
let sentRects = '{}'
let frame = 0

function track(elements: TrackedElement[]) {
  const next = new Map<string, { selector: string; element: Element | null }>()
  for (const { id, selector } of elements) {
    const held = followed.get(id)?.element
    next.set(id, { selector, element: held?.isConnected ? held : null })
  }
  followed = next
  watch()
}

function watch() {
  if (!frame) frame = requestAnimationFrame(update)
}

function update() {
  frame = 0
  const target = hovered?.isConnected ? { selector: selectorOf(hovered), rect: rectOf(hovered) } : null
  const hover = JSON.stringify([target, byKey])
  if (hover !== sentHover) {
    sentHover = hover
    send({ type: 'hover', target, ...(target && byKey && { byKey: true }) })
  }
  const rects: Record<string, Box | null> = {}
  for (const [id, entry] of followed) {
    if (!entry.element?.isConnected) entry.element = findElement(entry.selector)
    rects[id] = entry.element ? rectOf(entry.element) : null
  }
  const json = JSON.stringify(rects)
  if (json !== sentRects) {
    sentRects = json
    send({ type: 'rects', rects })
  }
  if (target || followed.size > 0) watch()
}

ipcRenderer.on(DOCUMENT_BRIDGE_CHANNEL, (_event, message: ToDocument) => {
  if (message.type === 'restore-scroll') restore(message.scroll)
  else if (message.type === 'mode') setMode(message.mode)
  else if (message.type === 'track') track(message.elements)
  else if (message.type === 'resolve') resolve(message.id, message.strokes)
  else if (message.type === 'key' && mode === 'pick') pickKey(message.key)
  else if (message.type === 'text-edit-failed' && lastEdit) {
    lastEdit.element.textContent = lastEdit.before
    lastEdit = null
  }
})

window.addEventListener('DOMContentLoaded', () => send({ type: 'ready', url: location.href }))
