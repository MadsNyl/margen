import { metaContent } from './html'

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
  /** Plays like a video: made at a Frame size, played on Margen's clock, narrated with a Voice and exported to MP4. */
  video: boolean
}

/** In the order the Project page's cards show them: Blank first. */
export const TEMPLATES: readonly TemplateInfo[] = [
  { id: 'blank', name: 'Blank', description: 'An empty page for anything', video: false },
  { id: 'animation-video', name: 'Animation video', description: 'Motion that plays like a video', video: true },
]

/** Whether `value` is a Template that marks its Documents (every one but Blank). */
export function isMarkedTemplate(value: unknown): value is MarkedTemplateId {
  return value !== 'blank' && TEMPLATES.some((t) => t.id === value)
}

/** Whether a Document made from `template` plays like a video (`TemplateInfo.video`). */
export function isVideoTemplate(template: TemplateId | undefined): boolean {
  return TEMPLATES.some((t) => t.id === template && t.video)
}

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
  const content = metaContent(html, TEMPLATE_META)
  return isMarkedTemplate(content) ? content : undefined
}

export function isTemplateChoice(value: unknown): value is TemplateChoice {
  if (typeof value !== 'object' || value === null) return false
  const { template, frame } = value as Record<string, unknown>
  return TEMPLATES.some((t) => t.id === template) && (frame === undefined || (typeof frame === 'string' && Object.hasOwn(FRAME_SIZES, frame)))
}
