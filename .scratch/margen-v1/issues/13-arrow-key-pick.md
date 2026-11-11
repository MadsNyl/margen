# 13: Arrow-key Pick

**What to build:** In Pick, the arrow keys move the highlight to any element on the page: ← and → go to the previous/next visible element in document order, ↑ to the parent, ↓ to the first visible child; ↵ picks; the page scrolls to keep the highlight in view, and a small key guide shows (user stories 45–48; spec: Annotations, arrow-key Pick from the prototype).

**Blocked by:** 12

**Status:** ready-for-agent

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [ ] Holding → walks every visible element of a fixture page from top to bottom (Seam 2 test)
- [ ] ↑/↓ go to parent/first child; ↵ creates the Pick Annotation for the highlighted element
- [ ] Arrow keys do nothing to the highlight while typing in the comment box or Composer
- [ ] The key guide shows while navigating by keyboard
