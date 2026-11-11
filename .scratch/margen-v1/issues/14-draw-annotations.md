# 14: Draw Annotations

**What to build:** Draw Mode (D): draw freehand on the Document. While drawing, elements mostly enclosed light up live; on release the stroke resolves by the spec's Draw resolution rule. More strokes join the open drawing while its comment box is open (focus stays in the box). The Draw Annotation carries strokes, a Viewport screenshot with strokes, a crop of the strokes, the bounding box and the caught elements; the Turn prompt tells the Agent a drawing may point at something or show something to add (user stories 49–55).

**Blocked by:** 12

**Status:** ready-for-agent

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [ ] Draw resolution is a pure function tested on fixed geometry (outermost, LCA within ~2.2× area, up to five), mirroring the prototype's rule
- [ ] Seam 2 tests: circling the fixture's card grid resolves to the grid; drawing on empty space resolves to nothing; a second stroke joins the same Annotation
- [ ] Screenshots are attached to the Turn as images (fake provider receives them)
- [ ] Strokes and markers use the blue accent and stay in page coordinates
