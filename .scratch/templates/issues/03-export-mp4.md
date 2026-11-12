# 03: Export an Animation video to MP4

**What to build:** An Export button in the top bar of an Animation video. Margen steps the clock frame by frame at 30 fps at the frame size, captures each frame and encodes H.264 MP4 with a bundled ffmpeg, then saves through a Save dialog opening in the Project folder. Show progress and allow cancel.

**Blocked by:** 02

**Status:** ready-for-agent

Spec: `.scratch/templates/spec.md` (Export). Bundling precedent: `build/dugite-git.mjs`, `electron-builder.yml`. Export logic is a framework-free module under `src/main/` taking the frame source and ffmpeg path as arguments.

- [ ] ffmpeg fetched per arch at pack time and shipped unpacked; dev uses the same fetched binary
- [ ] Frame-exact capture via the clock from ticket 02, at the frame size regardless of window size
- [ ] Progress and cancel; the partial file is removed on cancel
- [ ] Seam 1 with a fake frame source and real ffmpeg (skipped if the binary is absent): frame count and duration are right
- [ ] Interface allows an audio track to be passed in (ticket 05 uses it)
