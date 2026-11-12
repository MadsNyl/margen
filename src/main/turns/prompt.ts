import type { Annotation, ElementDescriptor, TurnInput } from '@shared/agent'

// Turns what the user sent (text and Annotations) into the prompt for the Agent:
// the text, then each Annotation by number with its comment and descriptors.
// Screenshots go along as images. Any AgentProvider can use it.

export type PromptPart = { type: 'text'; text: string } | { type: 'image'; mediaType: 'image/png'; data: string }

/** The prompt for one Turn. `document` is the open Document, relative to the Project. */
export function buildPrompt(turn: TurnInput, document?: string): PromptPart[] {
  const attached = turn.attachments?.length
    ? [`I attached these files. Read them where they are:\n${turn.attachments.map((file) => `- ${file.path}`).join('\n')}`]
    : []
  if (turn.annotations.length === 0) {
    // Named every Turn, so the Agent knows which file "this page" is, even a new, empty one.
    const blocks = [turn.text, ...attached, ...(document ? [`(The Document open in Margen is ${document}.)`] : [])].filter(Boolean)
    return [{ type: 'text', text: blocks.join('\n\n') }]
  }
  // Each Pick's crop and each drawing's screenshot and crop are numbered in the order they're attached.
  let images = 0
  const pictured = turn.annotations.map((annotation) => {
    const parts = (annotation.kind === 'draw' ? [annotation.screenshot, annotation.crop] : [annotation.crop]).flatMap((url) => image(url))
    return { annotation, images: parts, numbers: parts.map(() => ++images) }
  })
  const blocks = [
    ...(turn.text ? [turn.text] : []),
    ...attached,
    `I pointed at these${document ? ` in ${document}` : ''} (shown in Margen). The numbers are mine:`,
    ...(turn.annotations.some((annotation) => annotation.kind === 'draw') ? [DRAWINGS] : []),
    ...pictured.map(({ annotation, numbers }) => describeAnnotation(annotation, document, numbers)),
  ]
  return [{ type: 'text', text: blocks.join('\n\n') }, ...pictured.flatMap((p) => p.images)]
}

const DRAWINGS =
  'A drawing may point at something (what its strokes enclose) or show something to add (a shape, a sketch, words, where it should go). Judge which from its comment and its strokes.'

function describeAnnotation(annotation: Annotation, document: string | undefined, images: number[]): string {
  const kind = annotation.kind === 'pick' ? 'Pick' : 'Drawing'
  const comment = annotation.comment.trim()
  const head = `[${annotation.number}] ${kind}${comment ? `: ${comment}` : ' (no comment)'}`
  const seen = `  seen at a Viewport ${annotation.viewportWidth}px wide`
  if (annotation.kind === 'pick') {
    const [element, ...details] = describeElement(annotation, document, '  ')
    const picture = images.length ? [`  image ${images[0]}: the element as it looked`] : []
    return [head, element, seen, ...picture, ...details].join('\n')
  }
  const { x, y, width, height } = annotation.boundingBox
  return [
    head,
    `  strokes at x ${Math.round(x)}, y ${Math.round(y)}, ${Math.round(width)}×${Math.round(height)} px in the page (from its top left)`,
    seen,
    ...(images.length === 2 ? [`  images ${images[0]} and ${images[1]}: the Viewport with the strokes drawn in, and the strokes alone`] : []),
    ...(images.length === 1 ? [`  image ${images[0]}: the drawing`] : []),
    ...(annotation.targets.length > 0
      ? ['  the strokes enclose:', ...annotation.targets.flatMap((target) => describeElement(target, document, '    '))]
      : ['  nothing underneath the strokes']),
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
