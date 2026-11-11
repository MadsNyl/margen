/// <reference lib="dom" />
import { ipcRenderer } from 'electron'
import { DOCUMENT_BRIDGE_CHANNEL, type FromDocument, type ScrollPosition, type ToDocument } from '@shared/document-bridge'

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

ipcRenderer.on(DOCUMENT_BRIDGE_CHANNEL, (_event, message: ToDocument) => {
  if (message.type === 'restore-scroll') restore(message.scroll)
})

window.addEventListener('DOMContentLoaded', () => send({ type: 'ready', url: location.href }))
