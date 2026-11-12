import { describe, expect, test } from 'vitest'
import { arrowTarget, type ArrowKey } from '../../src/preload/arrows'

// Arrow-key Pick's traversal, over a fixture tree shaped like the DOM's
// elements (`parentElement`, `children`). Hidden elements stand for those with
// no box on the page (`display: none`, `<script>`, empty ones).

interface Node {
  name: string
  hidden: boolean
  parentElement: Node | null
  children: Node[]
}

function el(name: string, children: Node[] = [], hidden = false): Node {
  const node: Node = { name, hidden, parentElement: null, children }
  for (const child of children) child.parentElement = node
  return node
}

// <body>
//   <header><h1/><nav><a/><a/></nav></header>
//   <main><p/><div hidden><span/></div><section><h2/><p/></section></main>
//   <script hidden/>
// </body>
const body = el('body', [
  el('header', [el('h1'), el('nav', [el('a1'), el('a2')])]),
  el('main', [el('p1'), el('hidden', [el('inside-hidden', [], true)], true), el('section', [el('h2'), el('p2')])]),
  el('script', [], true),
])

const visible = (node: Node) => !node.hidden
const find = (name: string, from: Node = body): Node => {
  if (from.name === name) return from
  for (const child of from.children) {
    try {
      return find(name, child)
    } catch {
      // not in this branch
    }
  }
  throw new Error(`no ${name}`)
}
const press = (current: string | null, key: ArrowKey) => arrowTarget(body, current ? find(current) : null, key, visible)?.name ?? null

describe('arrow-key Pick', () => {
  test('→ held down walks every visible element in document order, then stays on the last', () => {
    const walked: string[] = []
    let current: string | null = null
    for (let i = 0; i < 20; i++) {
      current = press(current, 'ArrowRight') ?? current
      if (walked.at(-1) !== current && current) walked.push(current)
    }
    expect(walked).toEqual(['header', 'h1', 'nav', 'a1', 'a2', 'main', 'p1', 'section', 'h2', 'p2'])
  })

  test('← walks back in document order and stays on the first', () => {
    expect(press('h2', 'ArrowLeft')).toBe('section')
    expect(press('section', 'ArrowLeft')).toBe('p1')
    expect(press('main', 'ArrowLeft')).toBe('a2')
    expect(press('header', 'ArrowLeft')).toBeNull()
  })

  test('with nothing highlighted, any arrow starts on the first visible element', () => {
    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'] as const) expect(press(null, key)).toBe('header')
  })

  test('↑ goes to the parent, up to the body and no further', () => {
    expect(press('a1', 'ArrowUp')).toBe('nav')
    expect(press('header', 'ArrowUp')).toBe('body')
    expect(press('body', 'ArrowUp')).toBeNull()
  })

  test('↓ goes to the first visible child, and nowhere from an element with none', () => {
    expect(press('body', 'ArrowDown')).toBe('header')
    expect(press('nav', 'ArrowDown')).toBe('a1')
    expect(press('a1', 'ArrowDown')).toBeNull()
  })

  test('↓ skips hidden children; → from the body starts the walk', () => {
    const p1 = find('p1')
    p1.hidden = true
    try {
      expect(press('main', 'ArrowDown')).toBe('section')
    } finally {
      p1.hidden = false
    }
    expect(press('body', 'ArrowRight')).toBe('header')
  })

  test('⇧→ skips the element and everything inside it, climbing out at the last sibling', () => {
    expect(press('header', 'NextSibling')).toBe('main')
    expect(press('nav', 'NextSibling')).toBe('main')
    expect(press('h1', 'NextSibling')).toBe('nav')
    expect(press('p1', 'NextSibling')).toBe('section')
    expect(press('main', 'NextSibling')).toBeNull()
  })

  test('⇧← goes to the previous visible sibling, or the one before the nearest ancestor that has one', () => {
    expect(press('main', 'PreviousSibling')).toBe('header')
    expect(press('section', 'PreviousSibling')).toBe('p1')
    expect(press('h2', 'PreviousSibling')).toBe('p1')
    expect(press('a1', 'PreviousSibling')).toBe('h1')
    expect(press('header', 'PreviousSibling')).toBeNull()
  })
})
