import { z } from 'zod'
import { defineTool, type AgentTool } from '../agent/tools'
import { readNarration, type NarrationAudio } from '.'

// The Agent's line-length tool on an Animation video: how long each narration
// line takes to say with the video's Voice, so it can time scenes to the
// speech and keep lines from overlapping. Spoken lines are cached, so asking
// again, playing and exporting don't speak them again.

export const NARRATION_LENGTHS = 'narration_lengths'

const round = (seconds: number) => Math.round(seconds * 100) / 100

export function narrationLengthsTool({ file, audio }: { file: string; audio: NarrationAudio }): AgentTool {
  return defineTool({
    name: NARRATION_LENGTHS,
    description:
      "How long each narration line takes to say with the video's Voice, in seconds. Without `texts`, measures the lines of the narration block in the file as it is saved now, with when each ends and which ones run into the next. With `texts`, measures those lines instead, before you write them.",
    input: { texts: z.array(z.string()).optional().describe('Lines to measure instead of the narration block’s.') },
    async run({ texts }) {
      const narration = await readNarration(file)
      const { voice } = narration
      if (!voice) return { text: 'The video has no Voice yet, so its lines have no spoken length. The user chooses one from the Voice select under the video.', error: true }
      try {
        if (texts) {
          const lines: { text: string; seconds: number }[] = []
          for (const text of texts) lines.push({ text, seconds: round((await audio.speak(voice, text)).duration) })
          return { text: JSON.stringify({ voice, lines }) }
        }
        const lines: { start: number; text: string; seconds: number; end: number }[] = []
        for (const { start, text } of narration.lines) {
          const seconds = round((await audio.speak(voice, text)).duration)
          lines.push({ start, text, seconds, end: round(start + seconds) })
        }
        const overlaps = lines.flatMap((line, i) => {
          const next = lines[i + 1]
          return next && line.end > next.start ? [`Line ${i + 1} ends at ${line.end} s, after line ${i + 2} starts at ${next.start} s.`] : []
        })
        return {
          text: JSON.stringify({ voice, lines, ...(overlaps.length && { overlaps }), ...(narration.problem && { problem: narration.problem }) }),
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { text: `${message}. The user can download it from the Voice select under the video.`, error: true }
      }
    },
  })
}
