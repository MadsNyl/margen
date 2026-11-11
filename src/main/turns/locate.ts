import { parse, type DefaultTreeAdapterTypes } from 'parse5'
import type { ElementDescriptor } from '@shared/agent'

// Finds where a picked element is in the Document's source file, so the Agent
// can go straight to it. The page's script describes the element with a short
// CSS path (`main > section.press > p:nth-of-type(2)`: tags, an id, classes and
// :nth-of-type, joined by `>`). The source is parsed the way a browser parses
// it, and the path is matched against that. Scripts can change the page after
// it loads, so an element that isn't in the source, or a path that matches more
// than one element, has no line range.

type Element = DefaultTreeAdapterTypes.Element
type ParentNode = DefaultTreeAdapterTypes.ParentNode

interface Step {
  tag?: string
  id?: string
  classes: string[]
  nth?: number
}

export type Lines = NonNullable<ElementDescriptor['lines']>

/** A parsed source file, to look up several elements in. */
export function sourceIndex(source: string): (selector: string) => Lines | undefined {
  const elements: Element[] = []
  const walk = (node: ParentNode) => {
    for (const child of node.childNodes) {
      if (!('tagName' in child)) continue
      elements.push(child)
      walk('content' in child ? child.content : child)
    }
  }
  walk(parse(source, { sourceCodeLocationInfo: true }))

  return (selector) => {
    const steps = parseSelector(selector)
    if (!steps) return undefined
    // Classes are the likeliest thing for a script to change, so try without them too.
    for (const withClasses of [true, false]) {
      const found = elements.filter((element) => matches(element, steps, withClasses))
      if (found.length > 1) return undefined
      const location = found[0]?.sourceCodeLocation
      if (location) return { start: location.startLine, end: location.endLine }
    }
    return undefined
  }
}

function parseSelector(selector: string): Step[] | null {
  const steps: Step[] = []
  for (const part of selector.split('>').map((piece) => piece.trim())) {
    const match = /^([a-zA-Z][\w-]*)?((?:[#.][\w-]+)*)(?::nth-of-type\((\d+)\))?$/.exec(part)
    if (!match || !part) return null
    const [, tag, rest = '', nth] = match
    const step: Step = { classes: [] }
    if (tag) step.tag = tag.toLowerCase()
    if (nth) step.nth = Number(nth)
    for (const [, sign, name = ''] of rest.matchAll(/([#.])([\w-]+)/g)) {
      if (sign === '#') step.id = name
      else step.classes.push(name)
    }
    steps.push(step)
  }
  return steps
}

function matches(element: Element, steps: Step[], withClasses: boolean): boolean {
  let current: Element | null = element
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    if (!current || !step || !matchesStep(current, step, withClasses)) return false
    current = parentElement(current)
  }
  return true
}

function matchesStep(element: Element, step: Step, withClasses: boolean): boolean {
  const attr = (name: string) => element.attrs.find((a) => a.name === name)?.value
  if (step.tag && element.tagName !== step.tag) return false
  if (step.id && attr('id') !== step.id) return false
  if (withClasses && step.classes.length) {
    const classes = (attr('class') ?? '').split(/\s+/)
    if (!step.classes.every((name) => classes.includes(name))) return false
  }
  if (step.nth !== undefined) {
    const siblings = element.parentNode?.childNodes.filter((node): node is Element => 'tagName' in node && node.tagName === element.tagName)
    if ((siblings?.indexOf(element) ?? -1) + 1 !== step.nth) return false
  }
  return true
}

function parentElement(element: Element): Element | null {
  const parent = element.parentNode
  return parent && 'tagName' in parent ? parent : null
}
