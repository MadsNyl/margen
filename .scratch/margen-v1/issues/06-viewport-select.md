# 06: Viewport select

**What to build:** A select on the right of the editor's top bar shows the current Viewport and its live width (Desktop by default, fitted to the window) and switches to Tablet (820px) or Mobile (390px), resizing the Document view (user stories 33–34).

**Blocked by:** 05

**Status:** ready-for-agent

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [ ] Default is Desktop, fitting the window, with the live width shown and updating on window resize
- [ ] Choosing Tablet or Mobile resizes the Document to 820px / 390px with an animated transition
- [ ] The current Viewport width is readable by the rest of the editor (used by Annotations later)
- [ ] Seam 2 test switches to Mobile and checks the rendered width
