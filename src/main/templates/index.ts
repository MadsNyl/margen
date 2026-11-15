import { readFile } from 'node:fs/promises'
import { DEFAULT_FRAME, templateMarker, type FrameSizeId, type MarkedTemplateId, type TemplateChoice } from '@shared/templates'
import type { NarrationAudio } from '../narration'
import { narrationLengthsTool } from '../narration/tool'
import type { AgentSetup } from '../sessions'
import { animationVideoFile, animationVideoInstructions } from './animation-video'
import { posterFile, posterInstructions } from './poster'
import { slidesFile, slidesInstructions } from './slides'

// The built-in Templates' starting files and instructions. A Document's
// Template is the marker in its own file (ADR 0004), read when a Session on it
// starts, so a marked file opened from anywhere gets the same instructions.

/** What a Session on a marked Document is given to work with. */
interface SetupContext {
  /** The Document's file, absolute. */
  file: string
  narration: NarrationAudio
}

/** A marked Template's part in main: its starting file, and what the Agent gets for a Session on its Documents. */
interface BuiltInTemplate {
  file(frame: FrameSizeId): string
  setup(context: SetupContext): AgentSetup
}

const BUILT_IN: Record<MarkedTemplateId, BuiltInTemplate> = {
  'animation-video': {
    file: animationVideoFile,
    setup: ({ file, narration }) => ({ instructions: animationVideoInstructions(), tools: [narrationLengthsTool({ file, audio: narration })] }),
  },
  poster: { file: posterFile, setup: () => ({ instructions: posterInstructions() }) },
  slides: { file: slidesFile, setup: () => ({ instructions: slidesInstructions() }) },
}

/** The first version of a new Document's file: empty for Blank. */
export function startingFile({ template, frame = DEFAULT_FRAME }: TemplateChoice): string {
  return template === 'blank' ? '' : BUILT_IN[template].file(frame)
}

/** What the Agent gets for a Session on the Document at `file`, marked with `template`: its instructions and Margen's tools for it. */
export function templateSetup(template: MarkedTemplateId, context: SetupContext): AgentSetup {
  return BUILT_IN[template].setup(context)
}

/** The Template a Document's file is marked with, or `undefined` for a Blank one. Rejects when the file can't be read. */
export async function documentTemplate(file: string): Promise<MarkedTemplateId | undefined> {
  return templateMarker(await readFile(file, 'utf8'))
}
