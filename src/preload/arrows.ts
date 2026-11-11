// Arrow-key Pick (ticket 13): where the highlight goes for each arrow. ← and →
// walk every visible element under the root in document order, ↑ goes to the
// parent (up to the root), ↓ to the first visible child. Written over just the
// tree shape of the DOM, so it runs without a page; the page's script passes
// `document.body` and what counts as visible there.

export const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const
export type ArrowKey = (typeof ARROW_KEYS)[number]

export interface TreeElement<T> {
  readonly parentElement: T | null
  readonly children: ArrayLike<T>
}

/** The root's descendants in document order. */
function* descendants<T extends TreeElement<T>>(root: T): Generator<T> {
  for (const child of Array.from(root.children)) {
    yield child
    yield* descendants(child)
  }
}

/**
 * The element the highlight moves to from `current`, or `null` to stay put.
 * With nothing highlighted (or something outside the root) every arrow starts
 * on the first visible element.
 */
export function arrowTarget<T extends TreeElement<T>>(root: T, current: T | null, key: ArrowKey, visible: (element: T) => boolean): T | null {
  const inside = current !== null && (current === root || [...descendants(root)].includes(current))
  if (!inside) return first(descendants(root), visible)
  if (key === 'ArrowUp') return current === root ? null : current.parentElement
  if (key === 'ArrowDown') return Array.from(current.children).find(visible) ?? null
  if (current === root) return key === 'ArrowRight' ? first(descendants(root), visible) : null
  const all = [...descendants(root)]
  const at = all.indexOf(current)
  return key === 'ArrowRight' ? first(all.slice(at + 1), visible) : first(all.slice(0, at).reverse(), visible)
}

function first<T>(elements: Iterable<T>, visible: (element: T) => boolean): T | null {
  for (const element of elements) if (visible(element)) return element
  return null
}
