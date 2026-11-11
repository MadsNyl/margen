# 15: Project page chat bar

**What to build:** The Project page's "Let us build …" bar with rotating coloured words. Describing something creates a new Document (named from the description, unique) and opens it in the editor with its Session already running the message. A message that `@`-mentions an existing Document opens that Document and sends the message to its Session instead (user stories 21–23; spec: Sessions).

**Blocked by:** 04, 08

**Status:** done

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [x] Seam 1 tests: description → new file created + Turn started on its Session; `@file.html` → existing Document's Session gets the message
- [x] `@` offers a picker of the Project's Documents
- [x] The bar and title match the prototype, including on an empty Project

- From ticket 03: the chat bar and empty state live in the Project page component; its send button is always disabled for now.

- From ticket 04: after creating a new Project, move focus into the chat bar (the design does). Project names are folder slugs.

## Notes from ticket 15

- **Host API:** one new call, `project.send(text)`. It opens the Document the text `@`-mentions (the first `@path` that is one of the Project's Documents; trailing punctuation is ignored), or makes a new empty file named from the text, then sends `{ text, annotations: [] }` to that Document's active Session and returns the `OpenDocument`. The renderer then follows `document.opened` into the editor as usual.
- **Naming:** `src/main/projects/new-document.ts`. The slug of the description (the same `slugify` as Project folders), a leading `a`/`an`/`the` dropped, the first five words: `A summer menu for the café, with prices` → `summer-menu-for-the-cafe.html`. New files go at the top of the Project; a taken name gets `-2`, `-3`, … (written with `wx`, so nothing is overwritten). An `@` that names no Document is just part of the description.
- **The message is sent as typed**, `@path` included, and the Agent isn't told which file is open. For a new, empty Document the Agent has only the description, so **ticket 10's prompt builder should name the open Document** (its path) in every Turn's prompt; the chat bar needs nothing else.
- **UI:** the bar autofocuses whenever the Project page opens (ticket 04's note asked for it after New project). Typing `@` opens a listbox "Documents" under the bar, filtered by path as you type; ↑/↓ move, Enter or Tab or a click inserts `@<path> `, Escape or leaving the bar closes it. Start is disabled until there is text and while sending. The prototype has no picker design, so it uses the Menu styling.
- **Not done:** the Voice button still does nothing. If a Turn were running on the targeted Document's Session, `project.send` would reject; it can't today, since opening a Document puts the previous Session away.
