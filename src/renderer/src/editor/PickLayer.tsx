import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Annotation, Box } from '@shared/agent'
import type { Mode, ScrollPosition, TrackedElement } from '@shared/document-bridge'
import { boundsOf } from '@shared/draw'
import type { DocumentBridge } from './bridge'
import { usePageScroll } from './DrawLayer'
import { annotationLabel, labelOf, useDraft, type PendingAnnotation } from './draft'
import { useViewport } from './viewport'

// The layer over the Document view: the Pick highlight, a marker for each
// pending Annotation, the comment box of the open one, and after a reload the
// glow on the elements the last Turn pointed at. Boxes come from the page's
// script (in the frame's CSS px); the layer itself lets the mouse through to
// the page, except for the comment box.

const GLOW_MS = 1500
const BOX_WIDTH = 340

/** The elements an Annotation points at, as the page's script follows them. */
function tracked({ id, annotation }: PendingAnnotation): TrackedElement[] {
  if (annotation.kind === 'pick') return [{ id, selector: annotation.selector }]
  return annotation.targets.map((target, i) => ({ id: `${id}/${i}`, selector: target.selector }))
}

/** Where an Annotation is in the view: its element's box, or for a drawing its strokes' box (kept in page coordinates). */
function anchorOf({ id, annotation }: PendingAnnotation, rects: Record<string, Box | null>, scroll: ScrollPosition): Box | null {
  if (annotation.kind === 'pick') return rects[id] ?? null
  const { x, y, width, height } = boundsOf(annotation.strokes.flat())
  return { x: x - scroll.x, y: y - scroll.y, width, height }
}

export function PickLayer({ bridge, mode, reloads }: { bridge: DocumentBridge | null; mode: Mode; reloads: number }) {
  const draft = useDraft()
  const viewport = useViewport()
  const scroll = usePageScroll(bridge)
  const [hover, setHover] = useState<{ selector: string; rect: Box } | null>(null)
  const [rects, setRects] = useState<Record<string, Box | null>>({})
  const [glow, setGlow] = useState<TrackedElement[]>([])
  const latest = useRef({ add: draft.add, width: viewport.width })
  useEffect(() => {
    latest.current = { add: draft.add, width: viewport.width }
  })

  useEffect(() => {
    if (!bridge) return
    return bridge.on((message) => {
      if (message.type === 'hover') setHover(message.target)
      else if (message.type === 'rects') setRects(message.rects)
      else if (message.type === 'pick') {
        setRects((now) => ({ ...now, [message.id]: message.rect }))
        latest.current.add(message.id, { kind: 'pick', comment: '', viewportWidth: latest.current.width, ...message.element })
      } else if (message.type === 'drawing') {
        setRects((now) => ({ ...now, ...Object.fromEntries(message.rects.map((rect, i) => [`${message.id}/${i}`, rect])) }))
      }
    })
  }, [bridge])

  useEffect(() => {
    bridge?.send({ type: 'mode', mode })
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

  return (
    <div className="pointer-events-none absolute inset-0 z-[4] overflow-hidden">
      {mode === 'pick' && hover && (
        <Outline rect={hover.rect} className="border-[1.5px] border-ink bg-ink-soft transition-all duration-75">
          <span
            data-highlight
            className="absolute -top-[22px] -left-[1.5px] rounded-[5px_5px_5px_0] bg-ink px-[7px] py-[3px] font-mono text-[10px] whitespace-nowrap text-white"
          >
            {labelOf(hover.selector)}
          </span>
        </Outline>
      )}
      {glow.map(({ id }) => {
        const rect = rects[id]
        return rect ? <Outline key={id} glow rect={rect} className="glow rounded-[5px] border-2 border-mint-strong" /> : null
      })}
      {[...draft.annotations, ...draft.fading].map((pending) => (
        <Marker key={pending.id} pending={pending} anchor={anchorOf(pending, rects, scroll)} rects={rects} fading={draft.fading.includes(pending)} />
      ))}
      {open && <CommentBox key={open.id} pending={open} anchor={anchorOf(open, rects, scroll)} />}
    </div>
  )
}

/** What the comment box shows an Annotation caught: its element, a drawing's targets, or that a drawing is on empty space. */
function caught(annotation: Annotation): string[] {
  if (annotation.kind === 'pick') return [annotationLabel(annotation)]
  if (annotation.targets.length === 0) return ['nothing underneath · Claude gets the drawing and where it is']
  return annotation.targets.map((target) => labelOf(target.selector))
}

function Outline({ rect, className, glow, children }: { rect: Box; className: string; glow?: boolean; children?: ReactNode }) {
  const style: CSSProperties = { left: rect.x, top: rect.y, width: rect.width, height: rect.height }
  return (
    <div data-glow={glow || undefined} className={`absolute rounded-[4px] ${className}`} style={style}>
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
          ✕
        </button>
      </div>
      <ul aria-label="Caught" className="flex flex-wrap gap-[5px] px-3.5 pt-2">
        {caught(annotation).map((label, i) => (
          <li key={i} className="rounded-[5px] bg-ink-soft px-[7px] py-0.5 font-mono text-[10px] text-ink-tx">
            {label}
          </li>
        ))}
      </ul>
      <textarea
        ref={comment}
        autoFocus
        aria-label="Comment"
        placeholder={annotation.kind === 'pick' ? 'What should change here?' : 'What should Claude do? e.g. "tighten these" or "add this as a NEW stamp"'}
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
        <span className="mr-auto text-[11.5px] text-tx3">{annotation.kind === 'pick' ? 'Esc to discard' : 'Keep drawing to add strokes'}</span>
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
