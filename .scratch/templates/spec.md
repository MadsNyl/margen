# Templates, starting with Animation video

Status: done

Settled in the grilling session on 2026-11-12. Terms follow `GLOSSARY.md` (Template, Blank, Animation video, Voice); the marker decision is `docs/adr/0004-a-documents-template-is-a-marker-in-its-file.md`.

## Problem Statement

Every new Document starts Blank, so the Agent has to invent the shape of the thing each time. For a kind of Document with real rules, like a video made of HTML, the user has to explain those rules every time, and Margen can't play, annotate or export it as a video.

## Solution

A new Document can be started from a **Template**: a named starting point built into Margen, with the first version of the file and the rules the Agent follows on it. The first Template is **Animation video**: an HTML and CSS page of a fixed frame size that plays like a video, can be paused and annotated at any frame, exported to MP4, and narrated by an open-source **Voice** running on the user's Mac.

## Decisions

### Choosing a Template
- Built-in Templates only: **Blank** and **Animation video**.
- The Project page gets a row of cards between the chat bar and the Documents grid: **Blank** first, then **Animation video**. A card opens a dialog with a textarea for instructions and Attach files; Animation video adds the frame size (16:9 1920×1080 default, 9:16 1080×1920, 1:1 1080×1080, 4:5 1080×1350). Create makes the Document and opens it in the editor with the Turn running, exactly like the chat bar.
- The `@` popover (Project page chat bar and the editor's New Document dialog): a bare `@` shows two folders, **Documents** and **Templates**. ↑/↓ move, → or ↵ opens a folder, ← or Backspace on an empty query goes up, ↵ on an item chooses it. Inside Documents, the Project's subfolders open the same way. Typing after `@` skips folders and filters across everything, Templates included. Choosing a Template inserts an `@Animation video` chip; the message then makes a new Document from that Template at 16:9 (the message may ask for another size).

### The Template in the file (ADR 0004)
- A Document from a Template carries `<meta name="margen-template" content="animation-video">`. Margen reads the marker for the Template's controls and, at the start of each Session on that Document, gives the Agent the Template's instructions. Nothing is stored in the data directory and nothing else is written to the Project.
- Animation video's instructions are rules only, no house style: all motion is CSS animations (and transitions with fixed timing) on one clock, no JS timers, no hover-triggered motion; the frame is fixed at the chosen size, changed only when the user asks for another of the four Frame sizes; scenes are `<section>`s timed with `animation-delay`; the video's length is when the last animation ends, or the last narration line with the Voice if that's later; the narration block's format and the line-length tool. The starting file is the stage at the frame size with one empty scene.

### Playing and annotating
- For an Animation video, a **time bar** sits directly under the video frame, as wide as the frame: play/pause, the current time, a scrub track you drag back and forth (and click to jump), the length, and the Voice select with its download on the right. They leave the top bar; Export stays there (changed 2026-11-12, ticket 06).
- The editor shows the whole frame fitted to the window.
- Margen drives the clock through the Web Animations API (`document.getAnimations()`): pause all, set `currentTime`. Pick and Draw work on the paused frame; each Annotation records the time along with the Viewport, and the prompt says it ("at 0:12.4").
- A reload after an edit keeps the paused time, as scroll position is kept.

### Export
- An **Export** button in the top bar. Margen steps the clock frame by frame at 30 fps at the frame size, captures each frame and encodes H.264 MP4 with an ffmpeg bundled per arch. It is built from ffmpeg.org's source as an LGPL-only build using Apple's VideoToolbox encoder, rather than fetched like dugite's git, because the downloadable macOS builds are GPL (x264) (changed in ticket 03). A Save dialog opens in the Project folder. No background music in this version.

### Voices and narration
- **Settings → Voices** lists downloadable Voices: Kokoro-82M (Apache-2.0) and a set of Piper voices (MIT engine), each with size, licence and a preview. They download on demand from sherpa-onnx's model releases into the data directory, and run on-device through **sherpa-onnx** (Node addon) in an Electron utility process. Nothing is sent anywhere.
- One Voice per video, stored as `<meta name="margen-voice" content="kokoro/af_heart">` and chosen from the Voice select in the time bar. A Voice not on this Mac offers a download. No Voice: the video is silent.
- Narration lives in `<script type="application/json" id="narration">`: a list of lines with a start time and the text. Margen speaks each line with the Voice, caches the audio in the data directory (keyed by Voice and text), plays it in sync, and mixes it into the export.
- The Agent gets an in-process MCP tool from Margen (Agent SDK) that returns each narration line's spoken length with the video's Voice. This is Margen's first MCP server; later Agent tools go there too.

## Out of scope
- User-made Templates, other Templates.
- Background music, several Voices in one video, captions / speech-to-text.
- A timeline editor (tracks, moving scenes or lines by dragging).

## Tickets
`issues/01`–`06`; blocking is on each ticket.
