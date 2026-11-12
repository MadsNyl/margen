import { FRAME_SIZES, TEMPLATE_META, type FrameSizeId } from '@shared/templates'

// The Animation video Template: its starting file, the stage at the frame size
// with one empty scene, and the rules the Agent follows on it. Rules only, no
// house style: how it looks is up to the user and the Agent.

export function animationVideoFile(frame: FrameSizeId): string {
  const { width, height } = FRAME_SIZES[frame]
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="${TEMPLATE_META}" content="animation-video">
<title>Animation video</title>
<style>
  html, body { margin: 0; }
  body { background: #000; }
  .stage {
    position: relative;
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    background: #fff;
  }
  /* A scene shows from its --start for its --length. */
  .scene {
    position: absolute;
    inset: 0;
    visibility: hidden;
    animation: scene var(--length) linear var(--start);
  }
  @keyframes scene { from, to { visibility: visible; } }
</style>
</head>
<body>
<main class="stage">
  <section class="scene" style="--start: 0s; --length: 5s"></section>
</main>
</body>
</html>
`
}

const SIZES = Object.entries(FRAME_SIZES).map(([id, { width, height }]) => `${id} (${width} × ${height} px)`)

/** The Frame size: fixed, but the user may ask for another of Margen's. */
const FRAME = `The Frame size is the .stage's width and height in the file, and it stays as it is unless the user asks for another. Change it only when the user asks for a different size or shape, and then only to one of ${SIZES.slice(0, -1).join(', ')} or ${SIZES.at(-1)}: set the .stage's width and height to it and lay the scenes out again for the new frame. Lay everything out inside the .stage in px; nothing responsive, nothing outside it, no scrolling.`

/** The narration block's format, so Margen can speak it with the video's Voice. */
const NARRATION = `Narration, if the video has any, is one block in the file:
<script type="application/json" id="narration">
[
  { "start": 0.5, "text": "The first line Margen speaks." },
  { "start": 4.2, "text": "The next one." }
]
</script>
A list of lines in the order they're spoken. "start" is when the line begins, in seconds from the start of the video; "text" is what is said, as plain words (no markup). Keep lines from overlapping: a line should end before the next one starts. Margen speaks the lines with the video's Voice; don't add <audio> for them.`

/** Margen's line-length tool (`narration/tool.ts`), as Claude Code names it. */
const LINE_LENGTHS = `Margen gives you a tool, mcp__margen__narration_lengths, that says how long each narration line takes to say with the video's Voice. Call it after writing or changing the narration (it reads the file as saved) and time the scenes and the next lines' starts to what it says, so each line ends before the next starts and before the scene it belongs to ends. Pass "texts" to measure lines before you write them. Without a Voice chosen it can't measure; then leave about 0.4 s per word.`

export const ANIMATION_VIDEO_RULES: readonly string[] = [
  'All motion is CSS animations on one clock, the page\'s own: @keyframes with animation-delay and animation-duration. Transitions only with a fixed duration and delay. No JavaScript timers or animation loops (setTimeout, setInterval, requestAnimationFrame), no Web Animations started from script, and no motion triggered by hover, focus, clicks or scrolling. Margen pauses and seeks the clock to play, annotate and export the video, so anything that runs on its own time breaks it.',
  'No animation repeats forever (no "infinite"): every animation ends at a set time.',
  'No <video>, <audio>, GIFs or other media that plays on its own time.',
  FRAME,
  'The video is a sequence of scenes, each a <section class="scene"> inside the .stage, timed with animation-delay (its --start) and its length (its --length). Every animation-delay counts from the start of the video, also for the elements inside a scene: build them from the scene\'s start, as in calc(var(--start) + 0.4s).',
  "The video's length is when the last animation ends, or the last narration line, if that ends later. Keep the timeline in the CSS: add, remove or retime scenes by changing their --start and --length and the delays inside them.",
  NARRATION,
  LINE_LENGTHS,
]

export function animationVideoInstructions(): string {
  return [
    'The Document open in Margen is an Animation video: an HTML and CSS page of a fixed frame size that plays like a video. Margen plays and pauses it, the user annotates whatever frame it is paused on, and Margen exports it to MP4. Follow these rules whenever you change it:',
    ...ANIMATION_VIDEO_RULES.map((rule) => `- ${rule}`),
  ].join('\n\n')
}
