# 06: Viewport select

**What to build:** A select on the right of the editor's top bar shows the current Viewport and its live width (Desktop by default, fitted to the window) and switches to Tablet (820px) or Mobile (390px), resizing the Document view (user stories 33–34).

**Blocked by:** 05

**Status:** done

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [x] Default is Desktop, fitting the window, with the live width shown and updating on window resize
- [x] Choosing Tablet or Mobile resizes the Document to 820px / 390px with an animated transition
- [x] The current Viewport width is readable by the rest of the editor (used by Annotations later)
- [x] Seam 2 test switches to Mobile and checks the rendered width

## Notes from ticket 06 (for 12–14)

- **Reading the Viewport:** `useViewport()` from `src/renderer/src/editor/viewport.tsx` returns `{ name: 'Desktop' | 'Tablet' | 'Mobile', width }` anywhere inside `EditorScreen` (a context provider wraps the whole editor, chat panel included). `width` is in CSS px and equals the guest's `innerWidth`; record it as the Annotation's `viewportWidth`. The type and presets are `Viewport` / `VIEWPORTS` / `viewportOf` in `src/shared/viewport.ts`, so main can share the type.
- **Width rules:** Desktop is the frame's measured width (ResizeObserver, rounded); Tablet and Mobile report 820 / 390 straight away, even during the 450 ms width transition. If geometry matters right after a switch (Draw canvas sizing, screenshots), wait for the frame's `transitionend` or the bridge's next geometry answer rather than trusting the box mid-animation.
- **Layout:** the frame (`role="region" aria-label="Document view"`) gets an inline `width` (`100%` or `820px`/`390px`) and keeps `h-full`; the stage now has `overflow-x-auto`, so Tablet scrolls sideways in a window too narrow for 820px instead of shrinking. Overlays inside the frame (`absolute inset-0`) follow its width for free.
- The Viewport choice is React state in `EditorScreen`: kept when switching Documents with the breadcrumb, back to Desktop after leaving the editor. Not persisted.
