# 02: Playing and annotating an Animation video

**What to build:** For a Document with the Animation video marker: play/pause and a timer in the editor's top bar, the frame fitted to the window, the CSS clock driven by Margen through the Web Animations API, the paused time recorded on every Pick and Draw Annotation and named in the prompt, and the paused time kept across reloads.

**Blocked by:** 01

**Status:** done

Spec: `.scratch/templates/spec.md` (Playing and annotating). The Document script is `src/preload/document.ts`; messages go through `src/shared/document-bridge.ts`.

- [x] Clock control in the Document script: pause all animations, seek to t, play from t, report length (latest end of all animations) and current time
- [x] Top bar play/pause + timer only on marked Documents; ordinary Documents unchanged
- [x] Annotations carry the time; the prompt says "at m:ss.s"
- [x] Reload keeps the paused time
- [x] Unit tests for length and time formatting; Seam 2: pause, pick, check the Annotation's time

## Notes from ticket 02

- **The clock** (`src/shared/clock.ts`): times are seconds from the start of the video everywhere (bridge, Annotations, prompt). `videoLength(endsMs)` is the latest finite `getComputedTiming().endTime`, in seconds; `formatTime(s)` gives `m:ss.s` (0:12.4), carrying tenths into seconds and minutes.
- **In the page** (`src/preload/clock.ts`, `takeClock(report)`): the Document script reads the marker from the loaded page (`templateMarker(document.head.outerHTML)`) on DOMContentLoaded, so a reload that adds or removes it is followed. On a marked page it takes the clock at once: every animation from `document.getAnimations()` is paused and set to one time, and held on to (a finished, unfilled animation drops out of `getAnimations()`). Playing never hands them back: each frame sets them all to the time since play, so they stay on one clock, and so does anything the page makes later. Ordinary pages are untouched.
- **Bridge messages** (`src/shared/document-bridge.ts`): `ready` now carries `template?`. To the page: `clock-play { time? }` (from where it is, from 0 once ended), `clock-pause`, `clock-seek { time, id? }` (pauses there, kept within 0 and the length). From the page: `clock { clock: ClockState, id? }`, where `ClockState` is `{ time, length, playing, frame: { width, height } }` (the frame is the `.stage`'s offset size, or the page's). It's sent when the clock is taken (at 0), on load and fonts settling, every frame while playing, on pause, and after a seek **once that frame has been drawn** (two rAFs), with the seek's `id`.
- **Editor** (`editor/clock.tsx`): `useVideoClock(bridge, video, url)` seeks the page to the kept time (id `restore`) every time the bridge comes up, and ignores what the new page says until that seek's answer, so reloads keep the paused time (the notice says "time kept"). It redraws only when the timer's tenth changes while playing. `VideoControls` is play/pause and the `timer` "Time". `EditorScreen` reads the marker from each `ready` (`DocumentView`'s `onReady(bridge, template)`), always fits the frame (`clock.state.frame`) to the window, hides Fit and the Viewport select for a video, gives Annotations the frame's width as their Viewport, and pauses when Pick or Draw is chosen. `usePausedTime()` is what Pick and Draw record as `Annotation.time`; the prompt says "seen at a Viewport 1920px wide, at 0:12.4 in the video", and a sent message's row shows "· at 0:12.4".
- **Ticket 03 (export):** step with `clock-seek { time: n / 30, id }` and capture when the `clock` answer with that `id` arrives; the frame is drawn by then. The size is `ClockState.frame`; the length is `ClockState.length`. Lay the page out at the frame size, unscaled (the editor's Fit scales the view with a CSS transform, so capture from the guest itself, e.g. `webContents.capturePage`, not from the editor's box). Leave the clock paused where the user had it afterwards (seek back to the `time` from before).
- **Ticket 05 (narration):** follow `clock` messages for the time (every frame while playing, `playing` on and off), or subscribe in `useVideoClock`, whose `state` is throttled to tenths while playing; use the bridge messages directly for sync. Start each line when `time` crosses its `start`; stop audio on pause and on a `clock` with `playing: false`.
