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
 * The Viewport for a choice, given the frame's measured width. A fixed width is its own,
 * even mid-transition; Desktop is whatever the window leaves it.
 */
export function viewportOf(choice: ViewportChoice, measured: number): Viewport {
  const { name, width } = VIEWPORTS[choice]
  return { name, width: width ?? Math.round(measured) }
}
