/** The widths the Document can be shown at. Desktop fits the window; the others are fixed. */
export const VIEWPORTS = {
  desktop: { name: 'Desktop', width: null },
  tablet: { name: 'Tablet', width: 820 },
  mobile: { name: 'Mobile', width: 390 },
} as const

export type ViewportChoice = keyof typeof VIEWPORTS

/** The Viewport the Document is shown at: what Annotations record. */
export interface Viewport {
  name: (typeof VIEWPORTS)[ViewportChoice]['name']
  /** In CSS px, the width of the page's own viewport. */
  width: number
}

/**
 * With Fit on, the Document is laid out at a whole screen of this size and
 * scaled to fit the stage, as on a real screen: slide decks and other pages
 * made to fill a screen show as made.
 */
export const SCREENS: Record<ViewportChoice, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 },
}

/**
 * The Viewport for a choice, given the frame's measured width. A fixed width is its own,
 * even mid-transition; Desktop is whatever the window leaves it, or with `fit` a whole screen's width.
 */
export function viewportOf(choice: ViewportChoice, measured: number, fit = false): Viewport {
  const { name, width } = VIEWPORTS[choice]
  if (fit) return { name, width: SCREENS[choice].width }
  return { name, width: width ?? Math.round(measured) }
}

/** How much a screen is scaled to fit the room the stage has: as large as fits, never above actual size. */
export function fitScale(screen: { width: number; height: number }, room: { width: number; height: number }): number {
  if (room.width <= 0 || room.height <= 0) return 1
  return Math.min(1, room.width / screen.width, room.height / screen.height)
}
