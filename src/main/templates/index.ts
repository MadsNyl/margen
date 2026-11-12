import { readFile } from 'node:fs/promises'
import { DEFAULT_FRAME, templateMarker, type MarkedTemplateId, type TemplateChoice } from '@shared/templates'
import type { NarrationAudio } from '../narration'
import { narrationLengthsTool } from '../narration/tool'
import type { AgentSetup } from '../sessions'
import { animationVideoFile, animationVideoInstructions } from './animation-video'

// The built-in Templates' starting files and instructions. A Document's
// Template is the marker in its own file (ADR 0004), read when a Session on it
// starts, so a marked file opened from anywhere gets the same instructions.

/** The first version of a new Document's file: empty for Blank. */
export function startingFile({ template, frame = DEFAULT_FRAME }: TemplateChoice): string {
  return template === 'animation-video' ? animationVideoFile(frame) : ''
}

/** What the Agent is told at the start of each Session on a Document made from `template`. */
export function templateInstructions(template: MarkedTemplateId): string {
  switch (template) {
    case 'animation-video':
      return animationVideoInstructions()
  }
}

/** What the Agent gets for a Session on the Document at `file`, marked with `template`: its instructions and Margen's tools for it. */
export function templateSetup(template: MarkedTemplateId, { file, narration }: { file: string; narration: NarrationAudio }): AgentSetup {
  switch (template) {
    case 'animation-video':
      return { instructions: templateInstructions(template), tools: [narrationLengthsTool({ file, audio: narration })] }
  }
}

/** The Template a Document's file is marked with, or `undefined` for a Blank one. Rejects when the file can't be read. */
export async function documentTemplate(file: string): Promise<MarkedTemplateId | undefined> {
  return templateMarker(await readFile(file, 'utf8'))
}
