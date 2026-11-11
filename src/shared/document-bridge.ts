// The Document bridge: messages between the editor (the renderer) and Margen's
// script inside the Document view (`src/preload/document.ts`). The script runs in
// an isolated world, so the page's own scripts can neither see nor send these.
// It goes to the editor with `ipcRenderer.sendToHost`; the editor answers with
// `webview.send`. Both use one channel. Pick, Draw and screenshots (12–14) add
// message types here.

export const DOCUMENT_BRIDGE_CHANNEL = 'margen:document'

/** The Document view's session: its own cookies and storage, apart from Margen's, and the only one serving margen-doc://. */
export const DOCUMENT_PARTITION = 'persist:margen-doc'

/** Where the page is scrolled to, in CSS pixels. */
export interface ScrollPosition {
  x: number
  y: number
}

/** From the page's script to the editor. */
export type FromDocument =
  /** The page's DOM is ready and the script is listening. */
  | { type: 'ready'; url: string }
  /** The user scrolled the page (throttled). */
  | { type: 'scroll'; scroll: ScrollPosition }

/** From the editor to the page's script. */
export type ToDocument =
  /** Scroll back to where the page was before a reload, and hold it while late layout (fonts, images) settles. */
  { type: 'restore-scroll'; scroll: ScrollPosition }

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isScroll = (value: unknown): value is ScrollPosition =>
  typeof value === 'object' && value !== null && isNumber((value as ScrollPosition).x) && isNumber((value as ScrollPosition).y)

/** Checks a message that claims to come from the page. Never trust what arrives from the guest unchecked. */
export function parseFromDocument(value: unknown): FromDocument | null {
  if (typeof value !== 'object' || value === null) return null
  const message = value as { type?: unknown; url?: unknown; scroll?: unknown }
  if (message.type === 'ready' && typeof message.url === 'string') return { type: 'ready', url: message.url }
  if (message.type === 'scroll' && isScroll(message.scroll)) return { type: 'scroll', scroll: { x: message.scroll.x, y: message.scroll.y } }
  return null
}
