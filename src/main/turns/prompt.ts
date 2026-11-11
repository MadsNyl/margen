import type { Annotation, ElementDescriptor, TurnInput } from '@shared/agent'

// Turns what the user sent (text and Annotations) into the prompt for the Agent:
// the text, then each Annotation by number with its comment and descriptors.
// Screenshots go along as images. Any AgentProvider can use it.

export type PromptPart = { type: 'text'; text: string } | { type: 'image'; mediaType: 'image/png'; data: string }

/** The prompt for one Turn. `document` is the open Document, relative to the Project. */
export function buildPrompt(turn: TurnInput, document?: string): PromptPart[] {
  if (turn.annotations.length === 0) return [{ type: 'text', text: turn.text }]
  const blocks = [
    ...(turn.text ? [turn.text] : []),
    `I pointed at these${document ? ` in ${document}` : ''} (shown in Margen). The numbers are mine:`,
    ...turn.annotations.map((annotation) => describeAnnotation(annotation, document)),
  ]
  const images = turn.annotations.flatMap((annotation) =>
    annotation.kind === 'draw' ? [annotation.screenshot, annotation.crop].flatMap((url) => image(url)) : [],
  )
  return [{ type: 'text', text: blocks.join('\n\n') }, ...images]
}

function describeAnnotation(annotation: Annotation, document?: string): string {
  const kind = annotation.kind === 'pick' ? 'Pick' : 'Drawing'
  const comment = annotation.comment.trim()
  const head = `[${annotation.number}] ${kind}${comment ? `: ${comment}` : ' (no comment)'}`
  const seen = `  seen at a Viewport ${annotation.viewportWidth}px wide`
  if (annotation.kind === 'pick') {
    const [element, ...details] = describeElement(annotation, document, '  ')
    return [head, element, seen, ...details].join('\n')
  }
  // Ticket 14 shapes how a drawing is described.
  const { x, y, width, height } = annotation.boundingBox
  return [
    head,
    `  strokes around x ${Math.round(x)}, y ${Math.round(y)}, ${Math.round(width)}×${Math.round(height)} px in the page`,
    seen,
    ...annotation.targets.flatMap((target) => describeElement(target, document, '    ')),
  ].join('\n')
}

function describeElement(element: ElementDescriptor, document: string | undefined, indent: string): string[] {
  let where = ''
  if (element.lines) {
    const { start, end } = element.lines
    where = `${start === end ? `, line ${start}` : `, lines ${start}–${end}`}${document ? ` of ${document}` : ''}`
  }
  return [
    `${indent}element: <${element.tag}> at \`${element.selector}\`${where}`,
    `${indent}html: ${element.html}`,
    ...(element.text ? [`${indent}text: ${element.text}`] : []),
  ]
}

function image(dataUrl: string | undefined): PromptPart[] {
  const data = dataUrl && /^data:image\/png;base64,(.+)$/.exec(dataUrl)?.[1]
  return data ? [{ type: 'image', mediaType: 'image/png', data }] : []
}
