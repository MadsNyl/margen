# 12: Pick Annotations and the Composer

**What to build:** The floating toolbar with Browse and Pick (V, P; Esc back to Browse). In Pick, hovering highlights an element with its selector and the page's own clicks are blocked; clicking makes a numbered Pick Annotation and opens its comment box (↵ sends, ⌘↵ adds to the message, Esc discards). Pending Annotations show as markers on the Document and matching chips in the Composer (click to reopen, × to remove). Sending puts the Annotations into the Turn with their descriptors and Viewport width; markers fade and thumbnails stay in the chat (user stories 37–44, 56–67).

**Blocked by:** 07

**Status:** ready-for-agent

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [ ] The Turn prompt built from text + Pick Annotations includes number, comment, CSS path, tag, HTML snippet, source line range when found, and Viewport width (Seam 1 test on the built TurnInput)
- [ ] Seam 2 tests: pick an element by click, comment, send; the fake provider receives the Annotation
- [ ] Browse lets the page's links work; Pick blocks them
- [ ] Markers follow their element on layout change; chips and comment box share one draft
- [ ] Visuals follow the prototype (blue accent, dark toolbar pill)
