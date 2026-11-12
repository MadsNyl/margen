import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Box, DrawAnnotation, Point } from '@shared/agent'
import type { Mode, ScrollPosition } from '@shared/document-bridge'
import { boundsOf } from '@shared/draw'
import type { DocumentBridge } from './bridge'
import { captureDocument } from './capture'
import { useDraft, type Draft } from './draft'
import { placeDrawing, unionOf } from './follow'
import { useViewport } from './viewport'

// Draw: the strokes over the Document view and the live highlight of what the
// stroke being drawn catches. The page's script follows the pointer (so the
// page still scrolls under it) and resolves what strokes caught; this layer
// turns a finished stroke into a Draw Annotation, or adds it to the open one,
// and takes its screenshots. Strokes are kept in page coordinates and drawn
// shifted by the page's scroll.

const INK = '#2f7bff'
const STROKE_WIDTH = 3.5
/** Fewer points than this are a click, not a stroke. */
const MIN_POINTS = 4
const CROP_PAD = 16
const CROP_MAX = 640

/** Where the page is scrolled to, as its script reports it. */
export function usePageScroll(bridge: DocumentBridge | null): ScrollPosition {
  const [scroll, setScroll] = useState<ScrollPosition>({ x: 0, y: 0 })
  useEffect(
    () =>
      bridge?.on((message) => {
        if (message.type === 'view' || message.type === 'scroll') setScroll(message.scroll)
      }),
    [bridge],
  )
  return scroll
}

/**
 * `frame` is the Document view's own box, at the page's CSS px. `scale` is how much
 * the view is scaled down (Fit): this layer isn't, so it scales what it draws instead.
 */
export function DrawLayer({ bridge, mode, frame, scale = 1 }: { bridge: DocumentBridge | null; mode: Mode; frame: RefObject<HTMLDivElement | null>; scale?: number }) {
  const draft = useDraft()
  const viewport = useViewport()
  const scroll = usePageScroll(bridge)
  const [live, setLive] = useState<{ points: Point[]; rects: Box[] } | null>(null)
  const latest = useRef({ draft, width: viewport.width, scroll })
  useEffect(() => {
    latest.current = { draft, width: viewport.width, scroll }
  })
  /** Strokes sent to the script to resolve, by drawing; a drawing waits here until it's answered. */
  const resolving = useRef(new Map<string, Point[][]>())
  const drawings = useRef(0)

  useEffect(() => {
    if (!bridge) return
    return bridge.on((message) => {
      const { draft } = latest.current
      if (message.type === 'stroke-live') setLive(message)
      else if (message.type === 'stroke') {
        setLive(null)
        if (message.points.length < MIN_POINTS) return
        const open = draft.annotations.find((p) => p.id === draft.open)
        // A new stroke joins the open drawing (or one still being made); any other open Annotation is set aside.
        const joining = open?.annotation.kind === 'draw' ? open : null
        const waiting = [...resolving.current.keys()].find((id) => !draft.annotations.some((p) => p.id === id))
        const id = joining?.id ?? waiting ?? `draw-${++drawings.current}`
        if (!joining && !waiting && draft.open) draft.setOpen(null)
        const before = resolving.current.get(id) ?? (joining?.annotation as DrawAnnotation | undefined)?.strokes ?? []
        const strokes = [...before, message.points]
        resolving.current.set(id, strokes)
        bridge.send({ type: 'resolve', id, strokes })
      } else if (message.type === 'drawing') {
        const strokes = resolving.current.get(message.id)
        if (!strokes) return
        resolving.current.delete(message.id)
        const { scroll } = latest.current
        const caught = unionOf(message.rects)
        const targetsBox = caught ? { ...caught, x: caught.x + scroll.x, y: caught.y + scroll.y } : undefined
        const change = { strokes, targets: message.targets, boundingBox: boundsOf(strokes.flat()), ...(targetsBox && { targetsBox }) }
        if (draft.annotations.some((p) => p.id === message.id)) draft.update(message.id, change)
        else draft.add(message.id, { kind: 'draw', comment: '', viewportWidth: latest.current.width, ...change })
        draft.waitFor(takeScreenshots(draft, message.id, strokes, latest.current.scroll, frame.current))
      }
    })
  }, [bridge, frame])

  const drawn = [...draft.annotations, ...draft.fading].filter((p) => p.annotation.kind === 'draw')
  const rects = useFollowedRects(bridge)

  return (
    <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
      <svg data-strokes className="absolute inset-0 size-full" fill="none" stroke={INK} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
        <g transform={`scale(${scale})`}>
        {drawn.map((pending) => {
          const annotation = pending.annotation as DrawAnnotation
          const at = placeDrawing(pending.id, annotation, rects, scroll)
          return (
            <g
              key={pending.id}
              transform={`matrix(${at.scaleX} 0 0 ${at.scaleY} ${at.x} ${at.y})`}
              className={draft.fading.includes(pending) ? 'opacity-0 transition-opacity duration-600' : ''}
            >
              {annotation.strokes.map((points, i) => (
                <path key={i} d={pathOf(points)} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          )
        })}
        <g transform={`translate(${-scroll.x} ${-scroll.y})`}>{mode === 'draw' && live && <path d={pathOf(live.points)} vectorEffect="non-scaling-stroke" />}</g>
        </g>
      </svg>
      {mode === 'draw' &&
        live?.rects.map((rect, i) => (
          <div
            key={i}
            data-live
            className="absolute rounded-[4px] border-[1.5px] border-dashed border-ink bg-ink/6"
            style={{ left: rect.x * scale, top: rect.y * scale, width: rect.width * scale, height: rect.height * scale }}
          />
        ))}
    </div>
  )
}

/** The followed elements' boxes in view coordinates, as the page's script reports them. */
export function useFollowedRects(bridge: DocumentBridge | null): Record<string, Box | null> {
  const [rects, setRects] = useState<Record<string, Box | null>>({})
  useEffect(
    () =>
      bridge?.on((message) => {
        if (message.type === 'rects') setRects(message.rects)
        else if (message.type === 'drawing') setRects((now) => ({ ...now, ...Object.fromEntries(message.rects.map((rect, i) => [`${message.id}/${i}`, rect])) }))
      }),
    [bridge],
  )
  return rects
}

/** A smooth path through the points, as the prototype draws strokes. */
function pathOf(points: Point[]): string {
  const [first] = points
  if (!first) return ''
  const parts = [`M${first.x} ${first.y}`]
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i] as Point
    const q = points[i + 1] as Point
    parts.push(`Q${p.x} ${p.y} ${(p.x + q.x) / 2} ${(p.y + q.y) / 2}`)
  }
  const last = points.at(-1) as Point
  parts.push(`L${last.x} ${last.y}`)
  return parts.join(' ')
}

/** Each drawing's newest screenshots win, if an older capture finishes later. */
const captures = new Map<string, number>()

/** The Viewport with the strokes drawn in, and the strokes alone. */
async function takeScreenshots(draft: Draft, id: string, strokes: Point[][], scroll: ScrollPosition, frame: HTMLDivElement | null) {
  const run = (captures.get(id) ?? 0) + 1
  captures.set(id, run)
  const crop = cropOf(strokes)
  // Mid Viewport transition the view is still changing size, so wait for it to settle.
  await Promise.all(frame?.getAnimations().map((animation) => animation.finished) ?? [])
  const screenshot = frame ? await screenshotOf(strokes, scroll, frame.offsetWidth, frame.offsetHeight) : undefined
  if (captures.get(id) === run) draft.update(id, { crop, ...(screenshot && { screenshot }) })
}

async function screenshotOf(strokes: Point[][], scroll: ScrollPosition, width: number, height: number): Promise<string | undefined> {
  const image = await captureDocument()
  if (!image) return undefined
  // `capturePage` gives device pixels (2× on Retina); the screenshot is in the page's CSS px.
  const canvas = Object.assign(window.document.createElement('canvas'), { width, height })
  const context = canvas.getContext('2d')
  if (!context) return undefined
  context.drawImage(image, 0, 0, width, height)
  paint(context, strokes, -scroll.x, -scroll.y)
  return canvas.toDataURL('image/png')
}

function cropOf(strokes: Point[][]): string {
  const bounds = boundsOf(strokes.flat())
  const scale = Math.min(1, CROP_MAX / Math.max(bounds.width + CROP_PAD * 2, bounds.height + CROP_PAD * 2))
  const width = Math.ceil((bounds.width + CROP_PAD * 2) * scale)
  const height = Math.ceil((bounds.height + CROP_PAD * 2) * scale)
  const canvas = Object.assign(window.document.createElement('canvas'), { width, height })
  const context = canvas.getContext('2d')
  if (!context) return ''
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.scale(scale, scale)
  paint(context, strokes, CROP_PAD - bounds.x, CROP_PAD - bounds.y)
  return canvas.toDataURL('image/png')
}

function paint(context: CanvasRenderingContext2D, strokes: Point[][], dx: number, dy: number) {
  context.save()
  context.translate(dx, dy)
  context.strokeStyle = INK
  context.lineWidth = STROKE_WIDTH
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (const points of strokes) context.stroke(new Path2D(pathOf(points)))
  context.restore()
}
