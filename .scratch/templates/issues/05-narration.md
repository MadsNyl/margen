# 05: Narration with a Voice

**What to build:** The Voice select in an Animation video's top bar (stored as `margen-voice`, offering a download when missing); speaking the `#narration` lines with that Voice, cached in the data directory by Voice and text; playing them in sync with play/pause; mixing them into the MP4 export; and Margen's in-process MCP server for the Agent with a tool returning each line's spoken length. Add the tool to the Animation video instructions.

**Blocked by:** 02, 03, 04

**Status:** done

Spec: `.scratch/templates/spec.md` (Voices and narration). Agent adapter: `src/main/agent/claude/session.ts`.

- [x] Narration parsing (pure, unit-tested): lines with start time and text; bad JSON reported, not fatal
- [x] Voice select + marker; missing Voice offers download
- [x] Audio plays in sync with the clock, pauses with it, restarts correctly after seek/reload
- [x] Export mixes narration at the right offsets
- [x] MCP server registered on Sessions; line-length tool; fake Agent can call it in Seam 1

## Notes from ticket 05

**Parsing** (`src/shared/narration.ts`, pure, `test/unit/narration.test.ts`): `parseNarration(html) → { lines, problem? }`. It reads the first `<script id="narration">` (any attribute order or quotes), takes items with a numeric `start` ≥ 0 and non-empty `text`, and sorts them by start. Bad JSON, a non-list, and skipped items ("Narration lines 2 and 3 need…") go in `problem`, never thrown; the good lines still play. `voiceMarker(html)` / `withVoiceMarker(html, voice | null)` read and write `<meta name="margen-voice">`: it goes on the line after the Template marker (or at the top of `<head>`), replaces one already there, and removes its line for `null`, leaving the rest of the file byte for byte. `narrationSchedule(lines, time)` says which lines play from `time` (`delay`, `offset` into the line). `attribute()` in `shared/templates.ts` is now exported for this.

**Host API:** `video.narration() → VideoNarration` (`{ voice?, lines, problem? }`, read from the file each call). `video.setVoice(voice | null)` checks the id against the catalogue, rejects on other Documents and while a Turn runs, takes an `edit` Checkpoint ("Voice → piper/test"), and writes the marker; the reload watch reloads the view and the clock keeps its time. `video.speakLine(voice, text) → SpokenAudio`. No new events: the editor reads the narration again on `document.updated` and watches `voices.changed`.

**Cache** (`src/main/narration/index.ts`): `<dataDir>/narration/<sha256(voice + "\0" + text)>.wav`, written to a `.partial` and renamed. Concurrent requests for one line share one synthesis. The duration comes back from the WAV header (`decodeWav` in `voices/wav.ts`). Nothing evicts old lines yet; each line is about 50 KB a second.

**Export:** `exportOpenVideo` calls `narration.track(file)` before the first frame: every line is spoken (or read from the cache) and mixed in JS (`narration/mix.ts`, summed and clipped, at the Voice's own rate) into `<dataDir>/narration/export-<uuid>.wav`, which goes in as `exportVideo({ audio })` and is deleted afterwards. No Voice or no lines gives a silent export, as before. A Voice not on this Mac rejects after the Save dialog and before the first frame, so nothing is written. There's no progress while the lines are spoken, so a first export of a long narration waits before frame 1.

**Playback** (`editor/narration.tsx`): `useNarration(bridge, video, document)` fetches each line's WAV with `video.speakLine` once the Voice is installed, decodes it into an `AudioBuffer` (kept by Voice and text, so reloads don't fetch again), and listens to the bridge's raw `clock` messages. When `playing` turns on it schedules every remaining line on one shared `AudioContext` (`source.start(now + delay, offset)`). `playing: false` (pause, the end, a freshly loaded page) stops them. A clock more than 0.25 s from where the audio is (a seek, a stall, the restore seek after a reload) reschedules from the clock's time. Audio that arrives mid-play is picked up on the next frame.

**Voice select** (`VoiceSelect`, top bar between the timer and Export): "No voice", then every Voice in the catalogue with its language, plus the size for those not on this Mac. When the chosen Voice isn't installed, a "Download <name>" button sits next to it (the size, or "Try again"), and a progressbar shows while it downloads. A narration `problem` turns the icon red, sets the button's tooltip, and shows at the bottom of the menu. The icon is Hugeicons `VoiceIcon`.

**Margen's tools / the MCP server:** `src/main/agent/tools.ts` is the provider-free place to add a tool: `defineTool({ name, description, input: zod shape, run })` → `{ text, error? }`. `StartSessionOptions.tools` carries them. The Claude adapter (`claude/tools.ts`) makes one in-process SDK MCP server, `margen` (`createSdkMcpServer`, `alwaysLoad`), **per `claude` run**, because a server instance connects to one transport, and passes it as `options.mcpServers.margen`. Claude Code calls them `mcp__margen__<name>`. `toolRequest` turns those into a new `ToolRequest` kind, `margen`, which `editorPolicy` always allows, so they never ask. The tool card shows the bare name (`messages.ts`). `zod` ^4 is now a direct dependency; the SDK bundles the MCP SDK, so nothing else was added. Sessions get tools through `DocumentSessionOptions.setup()` (this replaced `instructions()`), which returns `{ instructions, tools }` from `templateSetup(template, { file, narration })` in `templates/index.ts`. A Blank Document's Session gets neither, so no MCP server.

**The line-length tool** (`narration/tool.ts`, `narration_lengths`): with no input, it measures the file's lines as saved and returns JSON `{ voice, lines: [{ start, text, seconds, end }], overlaps?: ["Line 1 ends at 0.4 s, after line 2 starts at 0.2 s."], problem? }`. With `texts`, it returns `{ voice, lines: [{ text, seconds }] }` for drafts. With no Voice, or a Voice not on this Mac, it returns an error result that says the user picks or downloads one from the top bar. Its rule is `LINE_LENGTHS` in `ANIMATION_VIDEO_RULES`.

**Fake Agent:** new step `{ type: 'call', tool, input? }`. It validates `input` with the tool's zod shape, runs it, emits `tool` `other` running/done (failed on an error result) under the tool's name, and records `{ tool, input, result }` in `agent.toolCalls`.

**Tests:** unit `narration.test.ts` and `narration-mix.test.ts`. Seam 1 `narration.test.ts` covers host calls, the marker and its Checkpoint, the cache surviving a restart, the tool through the fake Agent (lengths, drafts, overlaps, no Voice, missing Voice), no tools on Blank, and the narrated, silent and missing-Voice exports through the real ffmpeg. `claude-turn.test.ts` checks that every `claude` run gets its own `margen` server, that the tool runs without asking under the Editor preset, and lists and calls the tool over MCP JSON-RPC against the server instance, as `claude` does. Seam 2 `e2e/narration.spec.ts`: choosing a Voice writes the marker, Download fetches it, both lines are spoken before play, Play starts each line at its time (Web Audio's `start` is recorded in the page), Pause stops them, and Play again starts only what's left, at the right delay.

**Real export on this Mac (arm64):** I exported a 6 s 640×360 video through the built app with the downloaded Piper `no_NO-talesyntese-medium` and two Norwegian lines at 0.5 s and 3 s. ffprobe gave `h264 640x360 duration=6.000000` and `aac 22050 Hz mono duration=6.000000`. silencedetect puts speech starting at 0.56 s and 3.04 s (Piper adds a short lead-in).
