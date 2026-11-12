# 02: Playing and annotating an Animation video

**What to build:** For a Document with the Animation video marker: play/pause and a timer in the editor's top bar, the frame fitted to the window, the CSS clock driven by Margen through the Web Animations API, the paused time recorded on every Pick and Draw Annotation and named in the prompt, and the paused time kept across reloads.

**Blocked by:** 01

**Status:** ready-for-agent

Spec: `.scratch/templates/spec.md` (Playing and annotating). The Document script is `src/preload/document.ts`; messages go through `src/shared/document-bridge.ts`.

- [ ] Clock control in the Document script: pause all animations, seek to t, play from t, report length (latest end of all animations) and current time
- [ ] Top bar play/pause + timer only on marked Documents; ordinary Documents unchanged
- [ ] Annotations carry the time; the prompt says "at m:ss.s"
- [ ] Reload keeps the paused time
- [ ] Unit tests for length and time formatting; Seam 2: pause, pick, check the Annotation's time
