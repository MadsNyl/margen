# 04: Voices in Settings

**What to build:** Settings → Voices: list Kokoro-82M and a handful of Piper voices (including Norwegian) with size and licence, download on demand from sherpa-onnx's model releases into the data directory with progress, delete, and preview a sample sentence. Run synthesis with sherpa-onnx (Node addon) in an Electron utility process behind a framework-free `voices/` area with a provider interface so tests use a fake.

**Blocked by:** none

**Status:** ready-for-agent

Spec: `.scratch/templates/spec.md` (Voices and narration). Settings dialog: `src/renderer/src/components/Settings.tsx`.

- [ ] `voices/` area: catalogue, download (resumable or restart-safe, checksum if offered), list installed, delete, `speak(voice, text) → wav + duration`
- [ ] Utility process wiring is the only Electron-aware part
- [ ] Settings → Voices UI with download progress, delete, preview
- [ ] Packaging: the sherpa-onnx native addon works in the packed app for both arches
- [ ] Seam 1 with a fake catalogue and fake synthesiser; one contract-style test against the real addon, skipped unless asked
