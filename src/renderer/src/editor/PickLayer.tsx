import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import type { Annotation, Box } from '@shared/agent'
import { pickKeyOf, type Mode, type ScrollPosition, type TrackedElement } from '@shared/document-bridge'
import { boundsOf } from '@shared/draw'
import type { DocumentBridge } from './bridge'
import { captureDocument } from './capture'
import { usePageScroll } from './DrawLayer'
import { placeBox, placeDrawing } from './follow'
import { annotationLabel, labelOf, useDraft, type Draft, type PendingAnnotation } from './draft'
import { useViewport } from './viewport'
import { CloseIcon } from '../components/icons'

// The layer over the Document view: the Pick highlight, a marker for each
// pending Annotation, the comment box of the open one, and after a reload the
// glow on the elements the last Turn pointed at. Boxes come from the page's
// script (in the frame's CSS px); the layer itself lets the mouse through to
// the page, except for the comment box.

const GLOW_MS = 1500
const BOX_WIDTH = 340
/** A Pick's screenshot is at most this many CSS px on its longer side. */
const CROP_MAX = 640

/** The elements an Annotation points at, as the page's script follows them. */
function tracked({ id, annotation }: PendingAnnotation): TrackedElement[] {
  if (annotation.kind === 'pick') return [{ id, selector: annotation.selector }]
  return annotation.targets.map((target, i) => ({ id: `${id}/${i}`, selector: target.selector }))
}

/** Where an Annotation is in the view: its element's box, or for a drawing its strokes' box (kept in page coordinates). */
function anchorOf({ id, annotation }: PendingAnnotation, rects: Record<string, Box | null>, scroll: ScrollPosition): Box | null {
  if (annotation.kind === 'pick') return rects[id] ?? null
  // Moved with the elements the drawing caught, as its strokes are (follow.ts).
  return placeBox(boundsOf(annotation.strokes.flat()), placeDrawing(id, annotation, rects, scroll))
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.closest('[role=menu], [role=listbox], [role=dialog]') !== null)

export function PickLayer({
  bridge,
  mode,
  reloads,
  scale = 1,
  canvas,
  onKeyGuide,
}: {
  bridge: DocumentBridge | null
  mode: Mode
  reloads: number
  /**
   * How much the Document view is scaled down (Fit). The page reports boxes in its own
   * CSS px; this layer isn't scaled, so markers and the comment box keep their size.
   */
  scale?: number
  /** The Document view's own box, at the page's CSS px: what a Pick's screenshot is cut from. */
  canvas: RefObject<HTMLDivElement | null>
  /** Whether the highlight is moving by the arrow keys, for the key guide. */
  onKeyGuide?: (on: boolean) => void
}) {
  const draft = useDraft()
  const viewport = useViewport()
  const scroll = usePageScroll(bridge)
  const [hover, setHover] = useState<{ selector: string; rect: Box; byKey?: boolean } | null>(null)
  const [rects, setRects] = useState<Record<string, Box | null>>({})
  const [glow, setGlow] = useState<TrackedElement[]>([])
  const latest = useRef({ draft, width: viewport.width })
  useEffect(() => {
    latest.current = { draft, width: viewport.width }
  })
  const layer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!bridge) return
    return bridge.on((message) => {
      if (message.type === 'hover') setHover(message.target && { ...message.target, byKey: message.byKey })
      else if (message.type === 'rects') setRects(message.rects)
      else if (message.type === 'pick') {
        setRects((now) => ({ ...now, [message.id]: message.rect }))
        const { draft, width } = latest.current
        draft.add(message.id, { kind: 'pick', comment: '', viewportWidth: width, ...message.element })
        if (canvas.current) draft.waitFor(takeCrop(draft, message.id, message.rect, canvas.current))
      } else if (message.type === 'drawing') {
        setRects((now) => ({ ...now, ...Object.fromEntries(message.rects.map((rect, i) => [`${message.id}/${i}`, rect])) }))
      }
    })
  }, [bridge, canvas])

  useEffect(() => {
    bridge?.send({ type: 'mode', mode })
  }, [bridge, mode])

  const byKey = mode === 'pick' && !!hover?.byKey
  useEffect(() => {
    onKeyGuide?.(byKey)
  }, [onKeyGuide, byKey])

  // Arrow-key Pick while the editor has focus (with the page focused, its script sees the keys itself).
  // ↵ only picks something that's highlighted, so it doesn't take ↵ from the editor for nothing.
  const highlighted = useRef(false)
  useEffect(() => {
    highlighted.current = hover !== null
  })
  useEffect(() => {
    if (!bridge || mode !== 'pick') return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      const key = pickKeyOf(event)
      if (!key || (key === 'Enter' && !highlighted.current)) return
      event.preventDefault()
      bridge.send({ type: 'key', key })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bridge, mode])

  const elements = [...draft.annotations, ...draft.fading].flatMap(tracked).concat(glow)
  const trackKey = JSON.stringify(elements)
  useEffect(() => {
    bridge?.send({ type: 'track', elements: JSON.parse(trackKey) as TrackedElement[] })
  }, [bridge, trackKey])

  // After a reload, glow on what the last Turn's Annotations pointed at.
  const lastSent = useRef(draft.lastSent)
  useEffect(() => {
    lastSent.current = draft.lastSent
  })
  useEffect(() => {
    if (!reloads) return
    setGlow(lastSent.current.flatMap(tracked).map((element) => ({ ...element, id: `glow:${element.id}` })))
    const timer = setTimeout(() => setGlow([]), GLOW_MS)
    return () => clearTimeout(timer)
  }, [reloads])

  const open = draft.annotations.find((p) => p.id === draft.open)
  const view = (box: Box | null | undefined): Box | null => (box ? scaled(box, scale) : null)
  const viewRects = Object.fromEntries(Object.entries(rects).map(([id, rect]) => [id, view(rect)]))

  return (
    <div ref={layer} className="pointer-events-none absolute inset-0 z-[4] overflow-hidden">
      {mode === 'pick' && hover && (
        <Outline
          rect={scaled(hover.rect, scale)}
          kbd={hover.byKey}
          className={`border-[1.5px] border-ink bg-ink-soft transition-all duration-75 ${hover.byKey ? 'shadow-[0_0_0_4px_rgba(47,123,255,.18)]' : ''}`}
        >
          <span
            data-highlight
            className="absolute -top-[22px] -left-[1.5px] rounded-[5px_5px_5px_0] bg-ink px-[7px] py-[3px] font-mono text-[10px] whitespace-nowrap text-white"
          >
            {labelOf(hover.selector)}
          </span>
        </Outline>
      )}
      {glow.map(({ id }) => {
        const rect = viewRects[id]
        return rect ? <Outline key={id} glow rect={rect} className="glow rounded-[5px] border-2 border-mint-strong" /> : null
      })}
      {[...draft.annotations, ...draft.fading].map((pending) => (
        <Marker key={pending.id} pending={pending} anchor={view(anchorOf(pending, rects, scroll))} rects={viewRects} fading={draft.fading.includes(pending)} />
      ))}
      {open && <CommentBox key={open.id} pending={open} anchor={view(anchorOf(open, rects, scroll))} />}
    </div>
  )
}

/** A box in the page's CSS px, in the layer's (the Document view scaled by Fit). */
function scaled(box: Box, scale: number): Box {
  return scale === 1 ? box : { x: box.x * scale, y: box.y * scale, width: box.width * scale, height: box.height * scale }
}

/** Adds a screenshot of the picked element's box (in the view's CSS px) to its Annotation, for its thumbnail and the Agent. */
async function takeCrop(draft: Draft, id: string, rect: Box, view: HTMLElement) {
  const width = view.offsetWidth
  const height = view.offsetHeight
  const image = await captureDocument()
  // The part of the element that's in view.
  const x = Math.max(0, rect.x)
  const y = Math.max(0, rect.y)
  const w = Math.min(width, rect.x + rect.width) - x
  const h = Math.min(height, rect.y + rect.height) - y
  if (!image || w < 1 || h < 1) return
  const scale = Math.min(1, CROP_MAX / Math.max(w, h))
  const canvas = Object.assign(window.document.createElement('canvas'), { width: Math.ceil(w * scale), height: Math.ceil(h * scale) })
  const context = canvas.getContext('2d')
  if (!context) return
  // `capturePage` gives device pixels; the view's size says how many per CSS px.
  const ratio = image.naturalWidth / width
  context.drawImage(image, x * ratio, y * ratio, w * ratio, h * ratio, 0, 0, canvas.width, canvas.height)
  draft.update(id, { crop: canvas.toDataURL('image/png') })
}

/** More caught elements than this show as one "N elements" chip, with their labels on hover. */
const CAUGHT_LISTED = 2

/**
 * What the comment box shows an Annotation caught: its element, a drawing's targets
 * (or how many, past a couple), or that a drawing is on empty space.
 */
function caught(annotation: Annotation): { label: string; title?: string }[] {
  if (annotation.kind === 'pick') return [{ label: annotationLabel(annotation) }]
  if (annotation.targets.length === 0) return [{ label: 'nothing underneath · Claude gets the drawing and where it is' }]
  const labels = annotation.targets.map((target) => labelOf(target.selector))
  if (labels.length > CAUGHT_LISTED) return [{ label: `${labels.length} elements`, title: labels.join('\n') }]
  return labels.map((label) => ({ label }))
}

function Outline({ rect, className, glow, kbd, children }: { rect: Box; className: string; glow?: boolean; kbd?: boolean; children?: ReactNode }) {
  const style: CSSProperties = { left: rect.x, top: rect.y, width: rect.width, height: rect.height }
  return (
    <div data-glow={glow || undefined} data-kbd={kbd || undefined} className={`absolute rounded-[4px] ${className}`} style={style}>
      {children}
    </div>
  )
}

function Marker({
  pending,
  anchor,
  rects,
  fading,
}: {
  pending: PendingAnnotation
  anchor: Box | null
  rects: Record<string, Box | null>
  fading: boolean
}) {
  if (!anchor) return null
  const fade = fading ? 'scale-60 opacity-0 transition-[opacity,scale] duration-600' : ''
  // A drawing's targets get a dashed outline, so its strokes stay the thing you see.
  const outline = pending.annotation.kind === 'draw' ? 'border-2 border-dashed border-ink' : 'border-2 border-ink bg-ink/5'
  return (
    <>
      {tracked(pending).map(({ id }) => {
        const rect = rects[id]
        return rect ? <Outline key={id} rect={rect} className={`${outline} ${fade}`} /> : null
      })}
      <div
        data-marker={pending.annotation.number}
        className={`badge-pop absolute -mt-[11px] -ml-[11px] grid size-[22px] place-items-center rounded-full bg-ink text-[11px] font-semibold text-white shadow-[0_0_0_3px_#fff,0_4px_12px_rgba(0,0,0,.2)] ${fade}`}
        style={{ left: anchor.x, top: anchor.y }}
      >
        {pending.annotation.number}
      </div>
    </>
  )
}

/** The comment box next to an Annotation: ↵ sends the draft, ⌘↵ adds the Annotation to it, Esc discards. */
function CommentBox({ pending, anchor }: { pending: PendingAnnotation; anchor: Box | null }) {
  const draft = useDraft()
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: 8, top: 8 })
  const { id, annotation } = pending
  const kind = annotation.kind === 'pick' ? 'Pick' : 'Drawing'
  const comment = useRef<HTMLTextAreaElement>(null)
  // Drawing takes the focus into the Document; each new stroke gives it back, so typing goes on.
  const strokes = annotation.kind === 'draw' ? annotation.strokes.length : 0
  useEffect(() => {
    if (strokes > 1) comment.current?.focus()
  }, [strokes])

  useLayoutEffect(() => {
    const box = ref.current
    const frame = box?.parentElement
    if (!box || !frame) return
    const rect = anchor ?? { x: 8, y: 8, width: 0, height: 0 }
    const height = box.offsetHeight
    const left = Math.max(8, Math.min(rect.x, frame.offsetWidth - BOX_WIDTH - 8))
    // Below the Annotation, or above it when the page's view ends first.
    let top = rect.y + rect.height + 12
    if (top + height > frame.offsetHeight - 8) top = Math.max(8, rect.y - height - 12)
    setPosition((now) => (now.left === left && now.top === top ? now : { left, top }))
  }, [anchor])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Annotation ${annotation.number}`}
      className="comment-in pointer-events-auto absolute z-[6] w-[340px] rounded-[18px] bg-white text-tx shadow-[0_20px_50px_-12px_rgba(0,0,0,.28),0_0_0_1px_rgba(0,0,0,.06)]"
      style={position}
    >
      <div className="flex items-center gap-2 px-3.5 pt-3 text-[12.5px] text-tx2">
        <span className="grid size-[19px] place-items-center rounded-full bg-ink text-[10.5px] font-semibold text-white">{annotation.number}</span>
        <b className="font-medium text-tx">{kind}</b>
        <button className="ml-auto text-tx3 hover:text-tx" aria-label="Discard" title="Discard (Esc)" onClick={() => draft.remove(id)}>
          <CloseIcon />
        </button>
      </div>
      <ul aria-label="Caught" className="flex flex-wrap gap-[5px] px-3.5 pt-2">
        {caught(annotation).map(({ label, title }, i) => (
          <li key={i} title={title} className="rounded-[5px] bg-ink-soft px-[7px] py-0.5 font-mono text-[10px] text-ink-tx">
            {label}
          </li>
        ))}
      </ul>
      <textarea
        ref={comment}
        autoFocus
        aria-label="Comment"
        placeholder={annotation.kind === 'pick' ? 'What should change here?' : 'What should Claude do?'}
        value={annotation.comment}
        onChange={(event) => draft.setComment(id, event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            draft.setOpen(null)
          } else if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            draft.send()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            draft.remove(id)
          }
        }}
        className="block min-h-[58px] w-full resize-none border-0 bg-transparent px-3.5 py-2.5 text-sm leading-normal outline-0 select-text placeholder:text-tx3"
      />
      <div className="flex items-center gap-1.5 pt-2 pr-2.5 pb-2.5 pl-3.5">
        <span className="mr-auto text-[11.5px] text-tx3">{annotation.kind === 'pick' && 'Esc to discard'}</span>
        <button className="sbtn" onClick={() => draft.setOpen(null)}>
          Add <kbd>⌘↵</kbd>
        </button>
        <button className="sbtn sbtn-go" onClick={() => draft.send()}>
          Send <kbd>↵</kbd>
        </button>
      </div>
    </div>
  )
}
