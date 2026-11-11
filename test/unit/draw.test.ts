import { describe, expect, it } from 'vitest'
import type { Box, Point } from '@shared/agent'
import { boundsOf, resolveDrawing, resolveStroke, type Layout } from '@shared/draw'

// A page laid out by hand, in CSS px: a section holding a grid of three cards,
// each with a heading and a price, and a tiny badge.
//
//   section       0,0     1000×800
//   grid        100,100    600×300
//   card1       100,100    180×300   h1 110,110 160×30   p1 110,350 160×30
//   card2       310,100    180×300   h2 320,110 160×30   p2 320,350 160×30
//   card3       520,100    180×300   h3 530,110 160×30   p3 530,350 160×30
//   dot1–dot6   100+150k,450  30×30  (in the section, in a row under the grid)
//   badge       900,20      10×10    (100 px², too small to catch)

interface El {
  name: string
  box: Box
  parent: El | null
}

function page() {
  const all: El[] = []
  const el = (name: string, [x, y, width, height]: [number, number, number, number], parent: El | null = null): El => {
    const element: El = { name, box: { x, y, width, height }, parent }
    all.push(element)
    return element
  }
  const section = el('section', [0, 0, 1000, 800])
  const grid = el('grid', [100, 100, 600, 300], section)
  for (const [n, x] of [
    [1, 100],
    [2, 310],
    [3, 520],
  ] as const) {
    const card = el(`card${n}`, [x, 100, 180, 300], grid)
    el(`h${n}`, [x + 10, 110, 160, 30], card)
    el(`p${n}`, [x + 10, 350, 160, 30], card)
  }
  for (let k = 0; k < 6; k++) el(`dot${k + 1}`, [100 + 150 * k, 450, 30, 30], section)
  el('badge', [900, 20, 10, 10], section)
  const layout: Layout<El> = { elements: all, box: (e) => e.box, parent: (e) => e.parent }
  return layout
}

/** A closed stroke going round a rectangle. */
const around = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]

const names = (elements: El[]) => elements.map((e) => e.name)

describe('resolveStroke', () => {
  it('circling the card grid resolves to the grid, not its cards or the section', () => {
    expect(names(resolveStroke(around(90, 90, 710, 410), page()))).toEqual(['grid'])
  })

  it('drawing on empty space resolves to nothing', () => {
    expect(resolveStroke(around(750, 500, 950, 700), page())).toEqual([])
  })

  it('several enclosed elements resolve to their smallest common container when it is not much bigger than the stroke', () => {
    // The heading and the price of card 1, with a thin stroke that leaves out the card's middle.
    const stroke = [
      { x: 105, y: 105 },
      { x: 275, y: 105 },
      { x: 275, y: 145 },
      { x: 120, y: 145 },
      { x: 120, y: 345 },
      { x: 275, y: 345 },
      { x: 275, y: 385 },
      { x: 105, y: 385 },
    ]
    expect(names(resolveStroke(stroke, page()))).toEqual(['card1'])
  })

  it('keeps the separate elements when their common container is much bigger than the stroke', () => {
    // A long thin stroke over the three headings: the grid is far bigger than it.
    expect(names(resolveStroke(around(105, 105, 695, 145), page()))).toEqual(['h1', 'h2', 'h3'])
  })

  it('catches an element only when at least 60% of it is inside the stroke', () => {
    // Covers the left 70% of card 1's heading, then only 50% of it.
    expect(names(resolveStroke(around(105, 105, 222, 145), page()))).toEqual(['h1'])
    expect(resolveStroke(around(105, 105, 190, 145), page())).toEqual([])
  })

  it('ignores elements too small to mean anything', () => {
    expect(resolveStroke(around(890, 10, 920, 40), page())).toEqual([])
  })

  it('keeps at most five separate elements', () => {
    // A thin band along the six dots: their common container, the section, is far bigger.
    expect(names(resolveStroke(around(90, 440, 890, 490), page()))).toEqual(['dot1', 'dot2', 'dot3', 'dot4', 'dot5'])
  })
})

describe('resolveDrawing', () => {
  it('joins its strokes: what each caught, reduced to the outermost elements', () => {
    const layout = page()
    const heading = around(105, 105, 275, 145)
    const card1 = around(95, 95, 285, 405)
    const card3 = around(515, 95, 705, 405)
    expect(names(resolveDrawing([heading, card1], layout))).toEqual(['card1'])
    expect(names(resolveDrawing([card1, card3], layout))).toEqual(['card1', 'card3'])
    expect(names(resolveDrawing([around(750, 500, 950, 700), heading], layout))).toEqual(['h1'])
  })

  it('a drawing on empty space catches nothing', () => {
    expect(resolveDrawing([around(750, 500, 950, 700), around(760, 600, 990, 780)], page())).toEqual([])
  })
})

describe('boundsOf', () => {
  it('is the box around all the points', () => {
    expect(boundsOf([{ x: 10, y: 40 }, { x: 30, y: 5 }, { x: 20, y: 60 }])).toEqual({ x: 10, y: 5, width: 20, height: 55 })
  })
})
