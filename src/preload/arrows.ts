// Arrow-key Pick (ticket 13): where the highlight goes for each arrow. ← and →
// walk every visible element under the root in document order, ↑ goes to the
// parent (up to the root), ↓ to the first visible child. ⇧→ skips the current
// element and everything inside it, to its next sibling (or, at the last one,
// the next element after its parent); ⇧← goes to the previous sibling the same
// way, climbing when there is none. Written over just the
// tree shape of the DOM, so it runs without a page; the page's script passes
// `document.body` and what counts as visible there.

export const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PreviousSibling', 'NextSibling'] as const
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
  if (current === root) return key === 'ArrowRight' || key === 'NextSibling' ? first(descendants(root), visible) : null
  if (key === 'NextSibling') return nextSibling(root, current, visible)
  if (key === 'PreviousSibling') return previousSibling(root, current, visible)
  const all = [...descendants(root)]
  const at = all.indexOf(current)
  return key === 'ArrowRight' ? first(all.slice(at + 1), visible) : first(all.slice(0, at).reverse(), visible)
}

/** The first visible element after `current` and its subtree, in document order. */
function nextSibling<T extends TreeElement<T>>(root: T, current: T, visible: (element: T) => boolean): T | null {
  const all = [...descendants(root)]
  const inSubtree = new Set(descendants(current))
  return first(all.slice(all.indexOf(current) + 1).filter((element) => !inSubtree.has(element)), visible)
}

/** The nearest visible sibling before `current`, or before the nearest ancestor that has one. */
function previousSibling<T extends TreeElement<T>>(root: T, current: T, visible: (element: T) => boolean): T | null {
  for (let at: T | null = current; at && at !== root; at = at.parentElement) {
    const parent: T | null = at.parentElement
    if (!parent) return null
    const siblings = Array.from(parent.children)
    const before = first(siblings.slice(0, siblings.indexOf(at)).reverse(), visible)
    if (before) return before
  }
  return null
}

function first<T>(elements: Iterable<T>, visible: (element: T) => boolean): T | null {
  for (const element of elements) if (visible(element)) return element
  return null
}
