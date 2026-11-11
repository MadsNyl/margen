/// <reference lib="dom" />
import type { Box, ElementDescriptor } from '@shared/agent'

// Describing the page's elements for Annotations: a short CSS path, the tag, a
// cut of the HTML and the text. Shared by Pick (12, 13) and Draw (14). Main finds
// the source lines from the selector (`src/main/turns/locate.ts`), which reads
// exactly this grammar: tags, `#id`, `.class` and `:nth-of-type(n)`, joined by ` > `.

const HTML_CHARS = 400
const TEXT_CHARS = 160
const SIMPLE = /^[a-zA-Z_][\w-]*$/

/** The element's box in the page's viewport (the Document view's frame), in CSS px. */
export function rectOf(element: Element): Box {
  const { x, y, width, height } = element.getBoundingClientRect()
  return { x, y, width, height }
}

function step(element: Element): string {
  const tag = element.tagName.toLowerCase()
  if (element.id && SIMPLE.test(element.id)) return `${tag}#${element.id}`
  const classes = [...element.classList].filter((name) => SIMPLE.test(name)).slice(0, 2)
  const siblings = element.parentElement ? [...element.parentElement.children].filter((child) => child.tagName === element.tagName) : []
  const nth = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(element) + 1})` : ''
  return tag + classes.map((name) => `.${name}`).join('') + nth
}

/**
 * A short CSS path that finds just this element: it climbs until the path is
 * unique (with at least the parent, for context) or reaches an id or <body>.
 */
export function selectorOf(element: Element): string {
  const root = element.ownerDocument.documentElement
  if (element === root) return 'html'
  const steps: string[] = []
  for (let current: Element | null = element; current && current !== root; current = current.parentElement) {
    steps.unshift(step(current))
    if (current.id && SIMPLE.test(current.id)) break
    if (current.tagName === 'BODY') break
    if (steps.length >= 2 && unique(steps.join(' > '))) break
  }
  return steps.join(' > ')
}

function unique(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1
  } catch {
    return false
  }
}

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)

export function describeElement(element: Element): ElementDescriptor {
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
  return {
    selector: selectorOf(element),
    tag: element.tagName.toLowerCase(),
    html: cut(element.outerHTML, HTML_CHARS),
    ...(text && { text: cut(text, TEXT_CHARS) }),
  }
}

/** Finds an element again by a selector from `selectorOf`, or `null`. */
export function findElement(selector: string): Element | null {
  try {
    return document.querySelector(selector)
  } catch {
    return null
  }
}
