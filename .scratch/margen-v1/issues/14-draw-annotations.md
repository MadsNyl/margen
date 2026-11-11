# 14: Draw Annotations

**What to build:** Draw Mode (D): draw freehand on the Document. While drawing, elements mostly enclosed light up live; on release the stroke resolves by the spec's Draw resolution rule. More strokes join the open drawing while its comment box is open (focus stays in the box). The Draw Annotation carries strokes, a Viewport screenshot with strokes, a crop of the strokes, the bounding box and the caught elements; the Turn prompt tells the Agent a drawing may point at something or show something to add (user stories 49–55).

**Blocked by:** 12

**Status:** done

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [x] Draw resolution is a pure function tested on fixed geometry (outermost, LCA within ~2.2× area, up to five), mirroring the prototype's rule
- [x] Seam 2 tests: circling the fixture's card grid resolves to the grid; drawing on empty space resolves to nothing; a second stroke joins the same Annotation
- [x] Screenshots are attached to the Turn as images (fake provider receives them)
- [x] Strokes and markers use the blue accent and stay in page coordinates


**Research findings to respect** (details in `/Users/madsnylund/.t3/projects/margen-notes/`, see README.md there):
- `capturePage` hangs when the window is hidden and returns 2× images on Retina; handle both.

## Notes from ticket 14

- **Resolution:** `resolveStroke` / `resolveDrawing` / `boundsOf` in `src/shared/draw.ts`, generic over a `Layout<T>` (`elements`, `box`, `parent`; `parent` is `null` at the top, so `<body>` and above are never caught and an LCA that climbs out is "too big"). Unit tests on a hand-made layout in `test/unit/draw.test.ts`. The page script builds the layout from `document.body.querySelectorAll('*')` in page coordinates, once per stroke (`pageLayout` in `src/preload/document.ts`).
- **Who does what:** the page script follows the pointer in Draw (so the page still scrolls under it): `stroke-live { points, rects }` each frame, `stroke { points }` on release. The editor (`editor/DrawLayer.tsx`) owns the strokes: a stroke joins the open drawing (or one still waiting for its answer), else starts `draw-<n>` and sets any open Pick aside; it sends `resolve { id, strokes }` and the script answers `drawing { id, targets, rects }`, following target `i` as `<id>/<i>` at once (what `PickLayer`'s `tracked()` expects). Strokes are page coordinates; the script also sends `view { scroll }` every frame the page scrolls, and `usePageScroll(bridge)` gives it to both layers. Drawing markers anchor on the strokes' box (as in the prototype), targets get dashed outlines.
- **Draft:** `update(id, change)` (also patches the ref at once, so a send waiting on it sees the change) and `waitFor(promise)`: `send()` waits for in-flight screenshots before building the Turn.
- **Screenshots:** host call `document.capture` → `createHost({ captureDocument })`, which `src/main/index.ts` implements with the attached webview's `capturePage()` behind a 3 s timeout (it hangs on hidden windows) → `null` on failure; Seam 1 gets `null`. The renderer draws the capture (device px) into a canvas of the frame's CSS size, so Retina 2× comes out at 1×, and paints the strokes on top. The crop is the strokes alone on white (max 640 px), also the chat thumbnail. Taken after each stroke, waiting for any running Viewport transition (`frame.getAnimations()`) first; the newest capture per drawing wins.
- **Prompt:** one line for all drawings ("may point at something … or show something to add … judge which from its comment and its strokes"), each drawing with its strokes' box in page px, its image numbers, and what it encloses or "nothing underneath the strokes". Images go after the text in Annotation order (screenshot, crop).
- **Temp reads:** `messages.ts` drops `Read` of an image in a temp folder outside the Project (`os.tmpdir()`, `/tmp/`, `/var/folders/`, with and without `/private`). The contract test now sends a drawing with real PNGs: `claude` 2.1.287 + haiku read the image inline, no temp read and no approval in that run, so the permission policy is unchanged.
- **Comment box:** the Draw placeholder and "Keep drawing to add strokes" hint; a `Caught` list of target labels or "nothing underneath · Claude gets the drawing and where it is". Each new stroke focuses the comment again (drawing moves focus into the webview).
- **Seam 2** (`e2e/draw.spec.ts`): the comment box opens below the drawing and takes the mouse, so a second stroke must be drawn clear of it (the spec draws on the right). Strokes are real mouse input at frame box + guest coords, retried with `toPass` for the first lost input; it waits for the page's pen cursor before drawing.
- **For 13:** the page script's `setMode` now keeps one adopted cursor sheet per Mode (`cursors`); the BLOCKED listener also starts/ends strokes in Draw; `pointermove` also feeds the stroke.
