/// <reference lib="dom" />
import { ipcRenderer } from 'electron'
import type { Box } from '@shared/agent'
import {
  DOCUMENT_BRIDGE_CHANNEL,
  MODE_KEYS,
  PICK_KEYS,
  type FromDocument,
  type Mode,
  type ModeKey,
  type PickKey,
  type ScrollPosition,
  type ToDocument,
  type TrackedElement,
} from '@shared/document-bridge'
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
  isElement(target) && (target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !== null)

for (const type of BLOCKED) {
  window.addEventListener(
    type,
    (event) => {
      if (mode === 'browse') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (mode === 'pick' && event.type === 'click' && isElement(event.target)) pick(event.target)
    },
    { capture: true },
  )
}

window.addEventListener(
  'keydown',
  (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (mode === 'pick' && PICK_KEYS.includes(event.key as PickKey) && !editable(event.target)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      pickKey(event.key as PickKey)
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

/** Pick shows a plain arrow rather than the page's own pointers. Adopted, so nothing is written into the page. */
const plainCursor = (() => {
  try {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync('*, *::before, *::after { cursor: default !important }')
    return sheet
  } catch {
    return null
  }
})()

function setMode(next: Mode) {
  mode = next
  if (plainCursor) {
    const others = document.adoptedStyleSheets.filter((sheet) => sheet !== plainCursor)
    document.adoptedStyleSheets = mode === 'browse' ? others : [...others, plainCursor]
  }
  if (mode !== 'pick') hovered = null
  byKey = false
  watch()
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

/** Arrow-key Pick: ← → walk every visible element in document order, ↑ parent, ↓ first child, ↵ picks. */
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
  else if (message.type === 'key' && mode === 'pick') pickKey(message.key)
})

window.addEventListener('DOMContentLoaded', () => send({ type: 'ready', url: location.href }))
