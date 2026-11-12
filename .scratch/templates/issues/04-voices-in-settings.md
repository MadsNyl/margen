# 04: Voices in Settings

**What to build:** Settings → Voices: list Kokoro-82M and a handful of Piper voices (including Norwegian) with size and licence, download on demand from sherpa-onnx's model releases into the data directory with progress, delete, and preview a sample sentence. Run synthesis with sherpa-onnx (Node addon) in an Electron utility process behind a framework-free `voices/` area with a provider interface so tests use a fake.

**Blocked by:** none

**Status:** done

Spec: `.scratch/templates/spec.md` (Voices and narration). Settings dialog: `src/renderer/src/components/Settings.tsx`.

- [x] `voices/` area: catalogue, download (resumable or restart-safe, checksum if offered), list installed, delete, `speak(voice, text) → wav + duration`
- [x] Utility process wiring is the only Electron-aware part
- [x] Settings → Voices UI with download progress, delete, preview
- [x] Packaging: the sherpa-onnx native addon works in the packed app for both arches
- [x] Seam 1 with a fake catalogue and fake synthesiser; one contract-style test against the real addon, skipped unless asked

## Notes from ticket 04

**Engine.** `sherpa-onnx-node` 2.0.1 (Apache-2.0, N-API, prebuilt per platform in `sherpa-onnx-<os>-<arch>`). sherpa-onnx 2.0 (Oct 2026) removed espeak-ng; text must be phonemized outside it. Margen does that with `piper-phonemize-node` 1.5.9 (espeak-ng, **GPL-3.0-or-later**, bundles `espeak-ng-data`), passing `GenerationConfig.phonemeCodepoints`. sherpa's lexicon path covers only English and silently drops words it doesn't know ("Margen", "narrated"), so every Voice is phonemized. This puts a GPL component in the app; worth a conscious decision before release.

**Catalogue** (`src/main/voices/catalogue.ts`), all from `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/<asset>`, with each asset's size and sha256 from the release:
- `kokoro-int8-multi-lang-v1_0` (Kokoro-82M v1.0, int8, 132 MB, Apache-2.0): `model.int8.onnx`, `voices.bin`, `tokens.txt`. Voices `kokoro/af_heart` (sid 3), `kokoro/af_bella` (2), `kokoro/am_michael` (16) phonemized `en-us`; `kokoro/bf_emma` (21), `kokoro/bm_george` (26) phonemized `en-gb`. The sids come from sherpa's Kokoro docs.
- Ten Piper `vits-piper-<name>-medium` packs (about 67 MB each: `<name>.onnx`, `tokens.txt`), one Voice each, id `piper/<name>`: en_US-kristin, en_US-norman, en_GB-cori, en_GB-alba, **no_NO-talesyntese**, da_DK-talesyntese, sv_SE-nst, de_DE-thorsten, fr_FR-siwis, es_ES-davefx. Only voices whose data licence (from the MODEL_CARD) allows any use: CC0, CC BY 4.0, public domain. Each is phonemized with the espeak voice it was trained with (`espeak.voice` in its .onnx.json).

**Voice id format** for `margen-voice`: `<engine>/<name>`, e.g. `kokoro/af_heart` or `piper/no_NO-talesyntese-medium`. A pack (one download) holds one or more Voices; Kokoro is one pack with five.

**Host API** (`src/shared/host-api.ts`; types in `src/shared/voices.ts`):
- `voices.list() → VoicePack[]`: `{ id, name, engine, licence, size, voices: Voice[], state }`, where `state` is `available | downloading (received bytes) | installed | failed (message)`
- `voices.download(pack)`: resolves once installed, rejects on failure. Progress goes out as `voices.changed` at most every 100 ms, the latest count always included
- `voices.delete(pack)`: rejects while the pack downloads
- `voices.preview(voice) → SpokenAudio`: speaks the Voice's sample sentence in its language
- event `voices.changed: VoicePack[]` (in `FORWARDED_EVENTS`)

**Module** `src/main/voices/`: `createVoices({ dir, catalogue, synthesiser, onChange, fetch?, extract? })` returns `{ list, download, delete, speak, preview, dispose }`. `createHost` creates it as `voices` over `<dataDir>/voices`; `createHost({ voices: { catalogue?, synthesiser? } })` takes the deps. Ticket 05 should call `speak(voiceId, text)` on that object for narration and the line-length tool, and add its cache (keyed by Voice and text) around it in the data dir.

**`speak(voice, text) → Promise<SpokenAudio>`**: `{ wav: Uint8Array, duration: number }`. `wav` is a mono 16-bit PCM WAV with a 44-byte header, at the model's own rate (Kokoro 24000 Hz, Piper medium 22050 Hz). `duration` is in seconds (samples / rate). It rejects with "…is not on this Mac" when the pack isn't installed and "Not a Voice" for an unknown id. A 7-word Norwegian line came out at about 2.1 s of audio. Each model is loaded once per utility process and kept.

**Disk layout**: `<dataDir>/voices/<pack id>/…` (installed means this folder exists; it's moved into place in one rename), and `<dataDir>/voices/.downloads/<pack id>.tar.bz2.partial` (resumed with `Range`; thrown away when the sha256 doesn't match). Unpacking uses the system `tar -xjf`.

**Utility process**: `src/main/voice-process.ts` (`createUtilityProcessSynthesiser(workerPath)`) forks `out/main/voice-worker.js` on the first line spoken, and again after it exits. Messages are `{ id, request: SynthesisRequest }` → `{ id, samples: Float32Array, sampleRate } | { id, error }`. Two gotchas you'll hit again: (1) Electron's V8 memory cage refuses the addon's external buffers, so `generateAsync` must get `enableExternalBuffer: false`, or it fails with "TTS settlement failed". (2) In the packed app `piper-phonemize-node`'s `__dirname` is inside `app.asar`, so `sherpa.ts` initializes espeak-ng with the `app.asar.unpacked` path.

**Packaging**: `asarUnpack` covers `**/node_modules/sherpa-onnx-*/**` and `**/node_modules/piper-phonemize-*/**`. `pnpm-workspace.yaml` `supportedArchitectures` installs both darwin arches. `build/voice-addons.mjs` (afterPack) removes the other arch's folders. I checked this with `electron-builder --mac dir --arm64 --x64` (unsigned): both apps spoke a Norwegian line through the utility process, arm64 natively and x64 under Rosetta. The addon dylibs use `@loader_path`, so no `DYLD_LIBRARY_PATH` is needed. Signing hasn't been tried; electron-builder signs the unpacked Mach-O files with the app's identity.

**Renderer**: Settings → Voices is in `components/Settings.tsx` (`VoicesSection`). It plays the WAV through a `blob:` URL, so the CSP now has `media-src 'self' blob:`. Ticket 05 can play narration the same way.

**Tests**: Seam 1 `test/seam1/voices.test.ts` serves real tar.bz2 archives from a local HTTP server, covering progress, resume after a cut-off, checksum, delete, preview and the WAV header. Contract: `MARGEN_VOICE_CONTRACT=1 pnpm vitest run test/contract/voices.test.ts` downloads `piper-no_NO-talesyntese-medium` into `$TMPDIR/margen-voice-contract` and speaks through the real addons. Seam 2: `e2e/voices.spec.ts` uses `launchApp({ voices })`. `MARGEN_FAKE_VOICES` is always set in e2e, so Seam 2 never reaches GitHub.
