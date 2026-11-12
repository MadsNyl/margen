# 06: The time bar under an Animation video

**What to build:** Move an Animation video's controls out of the editor's top bar into a time bar directly under the video frame, as wide as the frame: play/pause, the current time, a scrub track (drag to seek live, click to jump, ←/→ when focused nudge by a frame or 1 s with ⇧), the length, and the Voice select with its download button on the right. Export stays in the top bar.

**Blocked by:** 02, 05, review fixes

**Status:** done

Spec: `.scratch/templates/spec.md` (Playing and annotating, changed 2026-11-12). Screenshot of today's top bar: `/Users/madsnylund/.t3/userdata/attachments/16dc57a9-2596-4ac2-b63d-c28fd9d4dd84-9d8c94c3-f97c-41bf-a041-b18e09202aa0.png`. Clock: ticket 02 notes; Voice select: ticket 05 notes. Design tokens in `src/renderer/src/styles.css`; match the prototype's light, quiet style.

- [x] Time bar under the frame, following the frame's fitted width as the window, chat or Fit change; ordinary Documents have none
- [x] Dragging pauses and seeks live (narration silent while dragging); releasing stays paused, or plays on if it was playing
- [x] Narration line start marks on the track (small ticks), if cheap
- [x] Pick/Draw markers follow the frame shown after a seek; Annotations record the time seeked to
- [x] Voice select and its download move into the bar; the top bar keeps Export only
- [x] Seam 2: drag the track, check the time and the Document's frame; existing video/narration e2e updated

## Notes from ticket 06

- **The time bar** (`TimeBar` in `editor/clock.tsx`, the `group` "Time bar"): play/pause, the `timer` "Time" (`0:04.3 / 0:12.0`), the scrub track (`slider` "Seek", `aria-valuetext` the time) and its `children` slot on the right, where `EditorScreen` puts the `VoiceSelect`. It sits in a column with the frame, as wide as the fitted frame (`screen.width * scale`); for a video the fit leaves `TIME_BAR_ROOM` (the bar's 30 px and a 10 px gap) under the frame. Ordinary Documents keep the plain frame (the wrapper is `display: contents`). The top bar keeps Export, Open in browser and the chat toggle. The Voice menu and its failure notice now open upwards; the `narration_lengths` tool's errors say "the Voice select under the video".
- **Seeking:** `VideoClock.seek(time)` sends `clock-seek` with an id `seek-n`; `VideoClock.seeking` is that time until the page answers that id (or the bridge changes, as on a reload), so the track and timer show where the user asked for without waiting the two frames. `play(time?)` now takes a time. The track snaps to whole frames at 30 fps (the export's frame times), so a click or ←/→ lands on exact times (4 s + 3 frames = 0:04.1); ⇧ nudges by 1 s.
- **Dragging** (`useScrub`): pointer capture; down seeks (which pauses, so the narration stops on the `playing: false` clock), each move seeks, up stays paused or sends `clock-play { time }` from the last seek if it was playing. Nothing new in the page script or the bridge.
- **Marks:** each narration line's start is a 1 px tick on the track (`data-line-start`), white once passed.
- **Markers and Annotations:** nothing changed: the page script already reports followed rects every frame, so markers follow a seek; `usePausedTime` is the answered clock time, so an Annotation records the time seeked to.
- **Tests:** Seam 2 `video.spec.ts`: the bar is under the frame and as wide, top bar has Export only; drag seeks live and stays paused, click jumps, ←/→ and ⇧ nudge, a Pick marker follows the heading after a seek, and the Annotation records the seeked time; releasing a drag while playing plays on. `narration.spec.ts`: two line ticks, a drag while playing stops the lines and starts none until release, then plays from the drag point.

