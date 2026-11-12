// The built-in Templates a new Document can start from, and the marker a
// Document made from one carries in its HTML (ADR 0004). The starting files and
// the Agent's instructions are in src/main/templates/.

/** `blank` has no marker: a Document without one is Blank. */
export type TemplateId = 'blank' | 'animation-video'

/** A Template that marks its Documents; the marker's `content` is its id. */
export type MarkedTemplateId = Exclude<TemplateId, 'blank'>

export interface TemplateInfo {
  id: TemplateId
  name: string
  description: string
}

/** In the order the Project page's cards show them: Blank first. */
export const TEMPLATES: readonly TemplateInfo[] = [
  { id: 'blank', name: 'Blank', description: 'An empty page for anything' },
  { id: 'animation-video', name: 'Animation video', description: 'Motion that plays like a video' },
]

export const FRAME_SIZES = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
} as const

export type FrameSizeId = keyof typeof FRAME_SIZES

/** The frame size an Animation video gets unless the user picks another. */
export const DEFAULT_FRAME: FrameSizeId = '16:9'

/** What a new Document starts from: a Template and, for Animation video, the frame size. */
export interface TemplateChoice {
  template: TemplateId
  frame?: FrameSizeId
}

export const TEMPLATE_META = 'margen-template'

/** The marked Template a Document's HTML names in `<meta name="margen-template" content="…">`, if it's one Margen knows. */
export function templateMarker(html: string): MarkedTemplateId | undefined {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (attribute(tag, 'name')?.toLowerCase() !== TEMPLATE_META) continue
    const content = attribute(tag, 'content')?.trim()
    if (content === 'animation-video') return content
  }
  return undefined
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined
}

export function isTemplateChoice(value: unknown): value is TemplateChoice {
  if (typeof value !== 'object' || value === null) return false
  const { template, frame } = value as Record<string, unknown>
  return TEMPLATES.some((t) => t.id === template) && (frame === undefined || (typeof frame === 'string' && Object.hasOwn(FRAME_SIZES, frame)))
}
