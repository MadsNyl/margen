import type { Box, DrawAnnotation } from '@shared/agent'
import type { ScrollPosition } from '@shared/document-bridge'

// A drawing's strokes are kept in page coordinates, as drawn. When the
// Document reflows (the window, the chat or Fit changes its width) the
// elements the strokes caught move and resize, so the strokes are moved and
// scaled with them: from the box the caught elements had when drawn to the box
// they have now. A drawing that caught nothing stays where it was drawn.

/** Maps a point in page coordinates (as drawn) to where it is in the view now. */
export interface Placement {
  scaleX: number
  scaleY: number
  /** Added after scaling, in view coordinates. */
  x: number
  y: number
}

/** The box around the boxes given, or null for none. */
export function unionOf(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null
  const left = Math.min(...boxes.map((b) => b.x))
  const top = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.width))
  const bottom = Math.max(...boxes.map((b) => b.y + b.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * Where drawing `id` goes now. `rects` are the followed elements' boxes in view
 * coordinates (a drawing's targets as `<id>/<i>`); `scroll` is the page's.
 */
export function placeDrawing(id: string, annotation: DrawAnnotation, rects: Record<string, Box | null>, scroll: ScrollPosition): Placement {
  const still = { scaleX: 1, scaleY: 1, x: -scroll.x, y: -scroll.y }
  const then = annotation.targetsBox
  const now = unionOf(annotation.targets.flatMap((_, i) => rects[`${id}/${i}`] ?? []))
  if (!then || !now || then.width <= 0 || then.height <= 0) return still
  const scaleX = now.width / then.width
  const scaleY = now.height / then.height
  return { scaleX, scaleY, x: now.x - then.x * scaleX, y: now.y - then.y * scaleY }
}

/** A box in page coordinates, placed in the view. */
export function placeBox(box: Box, at: Placement): Box {
  return { x: box.x * at.scaleX + at.x, y: box.y * at.scaleY + at.y, width: box.width * at.scaleX, height: box.height * at.scaleY }
}
