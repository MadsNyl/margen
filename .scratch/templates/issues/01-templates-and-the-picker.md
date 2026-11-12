# 01: Templates and choosing one

**What to build:** The Template concept end to end for a new Document: the built-in Templates (Blank, Animation video) with their starting file and Agent instructions; the cards row and Create dialog on the Project page; the `@` popover with Documents and Templates folders (Project page chat bar and the editor's New Document dialog); the `margen-template` marker and giving the Agent the Template's instructions at the start of each Session on a marked Document.

**Blocked by:** none

**Status:** done

Spec: `.scratch/templates/spec.md` (Choosing a Template; The Template in the file). Terms: `GLOSSARY.md`. Decisions: `docs/adr/0004-…`. Existing chat bar: `.scratch/margen-v1/issues/15-project-page-chat-bar.md` and `src/renderer/src/screens/ProjectPage.tsx`, `src/main/projects/new-document.ts`.

- [x] Seam 1: creating a Document from Animation video writes the starting file with the marker and chosen frame size, and the Turn's Session gets the Template's instructions; a Blank Document gets none; an opened file with the marker also gets them
- [x] Cards row (Blank, Animation video) and the dialog with textarea, Attach files and (video only) frame size; Create opens the editor with the Turn running
- [x] `@` popover: Documents and Templates folders, keyboard navigation as in the spec, flat filtering when typing, `@Animation video` chip makes a Document from it
- [x] Animation video instructions are rules only (see spec), including the narration block format; mention the line-length tool only once it exists (ticket 05 adds it)
- [x] Seam 2: one flow through a card and one through `@` Templates

## Notes from ticket 01

- **Host API:** `project.newDocument(text, attachments?, template?)` takes a third argument, `TemplateChoice` (`{ template: 'blank' | 'animation-video', frame?: '16:9' | '9:16' | '1:1' | '4:5' }`, checked with `isTemplateChoice`). Left out, the Document is Blank. Animation video without a frame is 16:9. `OpenDocument` now has `template?: 'animation-video'`, read from the marker when `document.open` runs. **Ticket 02:** use `document.current().template` / `document.opened` to show the play/pause controls. It is read once per open, so a marker the Agent adds later shows only after the Document is opened again. No new events.
- **Shared:** `src/shared/templates.ts` holds `TEMPLATES` (cards and `@` order), `FRAME_SIZES`, `DEFAULT_FRAME`, `TEMPLATE_META` and `templateMarker(html)`. That function is the one place that reads `<meta name="margen-template" content="…">`: any attribute order and either kind of quote, and unknown values are ignored. It has no Node imports, so the renderer or the Document preload can use it too.
- **Main:** `src/main/templates/index.ts`: `startingFile(choice)`, `templateInstructions(id)`, `documentTemplate(file)` (reads the marker from disk). `src/main/templates/animation-video.ts`: `animationVideoFile(frame)` (the stage is `.stage` at the frame size, with one `<section class="scene" style="--start: 0s; --length: 5s">`), and `ANIMATION_VIDEO_RULES`, joined by `animationVideoInstructions()`. **Ticket 05:** add the line-length tool's rule to `ANIMATION_VIDEO_RULES` (there's a comment where it goes). The narration format I gave the Agent is `<script type="application/json" id="narration">[{ "start": seconds, "text": "…" }]</script>`, with lines in order and not overlapping, so parse that shape.
- **How the instructions reach the Agent:** `StartSessionOptions.instructions` (`agent/provider.ts`). `startDocumentSession` takes `instructions(): Promise<string | undefined>` and calls it once, when the Agent session starts on the first Turn of each Session (new or resumed). `host/open-document.ts` passes one that reads the marker from the file just then. The Claude adapter sets it as the SDK's `systemPrompt`. With no `systemPrompt` the SDK runs with an empty one, so this adds the rules and changes nothing else. The fake records it in `agent.sessions[i].instructions`. Claude Code records the system prompt once per conversation (`snapshot`), so changed rules reach a resumed Session only after compaction.
- **Renderer:** `components/Mentions.tsx` holds `useMentions` (the `@` popover: Documents and Templates folders, subfolders, flat filtering) and `TemplateChip`. It is used by the Project page's `ChatBar` and by `editor/NewDocument.tsx`. `NewDocumentDialog` takes an optional `template` (a card's), which titles the dialog and shows the frame-size `radiogroup` for Animation video. `TemplateCards` in `screens/ProjectPage.tsx` is the cards row. The listbox's accessible name is now "Mentions" for every folder.

