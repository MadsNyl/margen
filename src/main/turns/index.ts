import type { Annotation, ElementDescriptor, TurnInput } from '@shared/agent'
import { sourceIndex } from './locate'

// Getting a Turn ready for the Agent. The prompt itself is `buildPrompt` (./prompt).

/** Adds where each Annotation's elements are in the Document's source (`lines`), when they can be found there. */
export function locateAnnotations(turn: TurnInput, source: string | undefined): TurnInput {
  if (turn.annotations.length === 0) return turn
  const lookup = source === undefined ? () => undefined : sourceIndex(source)
  const locate = <T extends ElementDescriptor>({ lines: _ignored, ...element }: T): T => {
    const lines = lookup(element.selector)
    return { ...element, ...(lines && { lines }) } as T
  }
  const annotations = turn.annotations.map(
    (annotation): Annotation =>
      annotation.kind === 'pick' ? locate(annotation) : { ...annotation, targets: annotation.targets.map(locate) },
  )
  return { ...turn, annotations }
}
