# 06: The time bar under an Animation video

**What to build:** Move an Animation video's controls out of the editor's top bar into a time bar directly under the video frame, as wide as the frame: play/pause, the current time, a scrub track (drag to seek live, click to jump, ←/→ when focused nudge by a frame or 1 s with ⇧), the length, and the Voice select with its download button on the right. Export stays in the top bar.

**Blocked by:** 02, 05, review fixes

**Status:** ready-for-agent

Spec: `.scratch/templates/spec.md` (Playing and annotating, changed 2026-11-12). Screenshot of today's top bar: `/Users/madsnylund/.t3/userdata/attachments/16dc57a9-2596-4ac2-b63d-c28fd9d4dd84-9d8c94c3-f97c-41bf-a041-b18e09202aa0.png`. Clock: ticket 02 notes; Voice select: ticket 05 notes. Design tokens in `src/renderer/src/styles.css`; match the prototype's light, quiet style.

- [ ] Time bar under the frame, following the frame's fitted width as the window, chat or Fit change; ordinary Documents have none
- [ ] Dragging pauses and seeks live (narration silent while dragging); releasing stays paused, or plays on if it was playing
- [ ] Narration line start marks on the track (small ticks), if cheap
- [ ] Pick/Draw markers follow the frame shown after a seek; Annotations record the time seeked to
- [ ] Voice select and its download move into the bar; the top bar keeps Export only
- [ ] Seam 2: drag the track, check the time and the Document's frame; existing video/narration e2e updated
