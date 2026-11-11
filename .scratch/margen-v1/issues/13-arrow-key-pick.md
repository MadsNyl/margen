# 13: Arrow-key Pick

**What to build:** In Pick, the arrow keys move the highlight to any element on the page: ← and → go to the previous/next visible element in document order, ↑ to the parent, ↓ to the first visible child; ↵ picks; the page scrolls to keep the highlight in view, and a small key guide shows (user stories 45–48; spec: Annotations, arrow-key Pick from the prototype).

**Blocked by:** 12

**Status:** done

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [x] Holding → walks every visible element of a fixture page from top to bottom (Seam 2 test)
- [x] ↑/↓ go to parent/first child; ↵ creates the Pick Annotation for the highlighted element
- [x] Arrow keys do nothing to the highlight while typing in the comment box or Composer
- [x] The key guide shows while navigating by keyboard

## Notes from ticket 13

- **Traversal** is `arrowTarget` in `src/preload/arrows.ts`, DOM-free (any tree with `parentElement`/`children`), unit-tested in `test/preload/arrows.test.ts`. Root is `document.body`: ← → walk its visible descendants in document order and stay at the ends, ↑ goes to the parent up to `<body>`, ↓ to the first visible direct child; with nothing highlighted any arrow starts on the first visible element. Visible = a non-empty box and `checkVisibility({ visibilityProperty: true })`.
- **Page script:** the keydown capture listener takes arrows/↵ in Pick (not in the page's own inputs), sets `hovered` with `byKey`, and scrolls with `scrollIntoView({ block: 'nearest' })`. Only a pointermove with new coordinates takes the highlight back to the mouse, so the page scrolling under a still cursor doesn't.
- **Bridge:** `hover` has `byKey?: true`; new `ToDocument` `key { key: PickKey }` (`PICK_KEYS`: the four arrows and Enter). `PickLayer` forwards arrows (and ↵ while something is highlighted) from the editor's window in Pick, so they work right after pressing P without clicking into the page. Not while typing, nor inside a dialog, menu or listbox, nor when a handler already took the key.
- **Key guide** is in `Toolbar` (`keyGuide` prop, `role="note"` "Keys"), replacing the mode hint while it shows; `PickLayer`'s `onKeyGuide` drives it through `EditorScreen`. The keyboard highlight gets the `.hl.kbd` ring and `data-kbd`.
- **Seam 2:** `e2e/arrow-pick.spec.ts` presses keys with the editor focused (the forwarded path). The path where the page itself has focus isn't covered by Seam 2.
