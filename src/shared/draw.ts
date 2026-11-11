import type { Box, Point } from './agent'

// Draw resolution (spec, "Annotations"; the prototype's `resolve` and
// `targetsFor`): which elements a drawing points at. Pure geometry, so the page's
// script runs it live while drawing and on release, and tests run it on a
// layout made by hand. Points and boxes share one coordinate space.

/** The page's elements as the resolution sees them. `parent` is `null` at the top: the page itself is never caught. */
export interface Layout<T> {
  elements: readonly T[]
  box(element: T): Box
  parent(element: T): T | null
}

/** How much of an element must be inside a stroke to be caught, sampled on a 5×5 grid. */
const ENCLOSED = 0.6
const SAMPLES = 5
/** Elements this small (in px²) are ignored. */
const MIN_AREA = 300
/** A common container is used when it's no bigger than this times the stroke's bounding box. */
const CONTAINER_RATIO = 2.2
const MAX_TARGETS = 5

export function boundsOf(points: readonly Point[]): Box {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** What one stroke caught: the outermost mostly-enclosed elements, or their smallest common container when it's not much bigger than the stroke. */
export function resolveStroke<T>(stroke: readonly Point[], layout: Layout<T>): T[] {
  if (stroke.length < 3) return []
  const bounds = boundsOf(stroke)
  const caught = layout.elements.filter((element) => {
    const box = layout.box(element)
    return box.width * box.height > MIN_AREA && coverage(box, stroke) >= ENCLOSED
  })
  const top = outermost(caught, layout)
  if (top.length <= 1) return top
  let container: T | null = top[0] ?? null
  while (container && !top.every((element) => contains(container as T, element, layout))) container = layout.parent(container)
  if (container) {
    const box = layout.box(container)
    if (box.width * box.height <= bounds.width * bounds.height * CONTAINER_RATIO) return [container]
  }
  return top.slice(0, MAX_TARGETS)
}

/** A drawing's targets: what each stroke caught, reduced to the outermost elements, up to five. */
export function resolveDrawing<T>(strokes: readonly (readonly Point[])[], layout: Layout<T>): T[] {
  const all = [...new Set(strokes.flatMap((stroke) => resolveStroke(stroke, layout)))]
  return outermost(all, layout).slice(0, MAX_TARGETS)
}

function outermost<T>(elements: T[], layout: Layout<T>): T[] {
  return elements.filter((element) => !elements.some((other) => other !== element && contains(other, element, layout)))
}

function contains<T>(ancestor: T, element: T, layout: Layout<T>): boolean {
  for (let current: T | null = element; current; current = layout.parent(current)) if (current === ancestor) return true
  return false
}

function coverage(box: Box, polygon: readonly Point[]): number {
  let inside = 0
  for (let i = 0; i < SAMPLES; i++)
    for (let j = 0; j < SAMPLES; j++)
      if (inPolygon({ x: box.x + (box.width * (i + 0.5)) / SAMPLES, y: box.y + (box.height * (j + 0.5)) / SAMPLES }, polygon)) inside++
  return inside / (SAMPLES * SAMPLES)
}

/** Even-odd ray casting; the stroke is closed from its last point back to its first. */
function inPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i] as Point
    const b = polygon[j] as Point
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
