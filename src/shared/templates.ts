import { metaContent } from './html'

// The built-in Templates a new Document can start from, and the marker a
// Document made from one carries in its HTML (ADR 0004). The starting files and
// the Agent's instructions are in src/main/templates/.

/** `blank` has no marker: a Document without one is Blank. */
export type TemplateId = 'blank' | 'animation-video' | 'poster' | 'slides'

/** A Template that marks its Documents; the marker's `content` is its id. */
export type MarkedTemplateId = Exclude<TemplateId, 'blank'>

export interface TemplateInfo {
  id: TemplateId
  name: string
  description: string
  /** Plays like a video: made at a Frame size, played on Margen's clock, narrated with a Voice and exported to MP4. */
  video: boolean
  /** Made for a fixed page (a Poster's sheet, a Slide): the editor shows a whole one fitted to the window, and it exports to PDF. */
  page?: Page
}

/** A fixed page, in CSS px (96 per inch). `pdf` is the PDF's page size. */
export interface Page {
  width: number
  height: number
  pdf: 'A4' | { width: number; height: number }
}

export const PAGES = {
  /** 210 × 297 mm. */
  a4: { width: 794, height: 1123, pdf: 'A4' },
  /** 16:9 at 13.33 × 7.5 in, as presentation apps make it. */
  slide: { width: 1280, height: 720, pdf: { width: 1280 / 96, height: 720 / 96 } },
} as const satisfies Record<string, Page>

/** In the order the Project page's cards show them: Blank first. */
export const TEMPLATES: readonly TemplateInfo[] = [
  { id: 'blank', name: 'Blank', description: 'An empty page for anything', video: false },
  { id: 'animation-video', name: 'Animation video', description: 'Motion that plays like a video', video: true },
  { id: 'poster', name: 'Poster', description: 'A full A4 page', video: false, page: PAGES.a4 },
  { id: 'slides', name: 'Slides', description: 'A deck, one slide per screen', video: false, page: PAGES.slide },
]

/** Whether `value` is a Template that marks its Documents (every one but Blank). */
export function isMarkedTemplate(value: unknown): value is MarkedTemplateId {
  return value !== 'blank' && TEMPLATES.some((t) => t.id === value)
}

/** Whether a Document made from `template` plays like a video (`TemplateInfo.video`). */
export function isVideoTemplate(template: TemplateId | undefined): boolean {
  return TEMPLATES.some((t) => t.id === template && t.video)
}

/** The fixed page a Document made from `template` is laid out on (`TemplateInfo.page`), if it has one. */
export function templatePage(template: TemplateId | undefined): Page | undefined {
  return TEMPLATES.find((t) => t.id === template)?.page
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
