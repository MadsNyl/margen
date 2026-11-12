# 01: Templates and choosing one

**What to build:** The Template concept end to end for a new Document: the built-in Templates (Blank, Animation video) with their starting file and Agent instructions; the cards row and Create dialog on the Project page; the `@` popover with Documents and Templates folders (Project page chat bar and the editor's New Document dialog); the `margen-template` marker and giving the Agent the Template's instructions at the start of each Session on a marked Document.

**Blocked by:** none

**Status:** ready-for-agent

Spec: `.scratch/templates/spec.md` (Choosing a Template; The Template in the file). Terms: `GLOSSARY.md`. Decisions: `docs/adr/0004-…`. Existing chat bar: `.scratch/margen-v1/issues/15-project-page-chat-bar.md` and `src/renderer/src/screens/ProjectPage.tsx`, `src/main/projects/new-document.ts`.

- [ ] Seam 1: creating a Document from Animation video writes the starting file with the marker and chosen frame size, and the Turn's Session gets the Template's instructions; a Blank Document gets none; an opened file with the marker also gets them
- [ ] Cards row (Blank, Animation video) and the dialog with textarea, Attach files and (video only) frame size; Create opens the editor with the Turn running
- [ ] `@` popover: Documents and Templates folders, keyboard navigation as in the spec, flat filtering when typing, `@Animation video` chip makes a Document from it
- [ ] Animation video instructions are rules only (see spec), including the narration block format; mention the line-length tool only once it exists (ticket 05 adds it)
- [ ] Seam 2: one flow through a card and one through `@` Templates
