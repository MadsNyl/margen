# 05: Open a Document in the editor, with live reload

**What to build:** Clicking a Document opens the editor: the Document rendered live on the left in a sandboxed view (scripts and network allowed, no Node), the chat panel on the right (empty for now), and a breadcrumb margen / Project / Document whose dropdown switches to another Document in the Project. "Open in browser" opens it in the default browser. When the file changes on disk the Document reloads once (debounced), keeps its scroll position and shows a brief "Reloaded" notice. Margen never writes to the Document (user stories 27–32, 35–36).

**Blocked by:** 03

**Status:** done

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [x] The rendered copy has Margen's script injected; the file on disk is never modified (tested)
- [x] Several quick writes to the file cause one reload (Seam 1 test on the watch event; Seam 2 test on the view)
- [x] Scroll position is restored after a reload (Seam 2 test)
- [x] The breadcrumb dropdown lists the Project's Documents and switches between them
- [x] The editor layout and toolbar placement match the prototype (toolbar may be empty until ticket 12)


**Research findings to respect** (details in `/Users/madsnylund/.t3/projects/margen-notes/`, see README.md there):
- Use `<webview>` or an iframe served via a custom `margen-doc://` scheme, not `WebContentsView` (it paints above Margen's own overlays). Inject Margen's script into the served copy only.
- A fully sandboxed iframe breaks the page's `localStorage`; see electron-webview-sandbox.md for the chosen trade-off.

- From ticket 03: Document rows take an `onClick`; `DocumentInfo.path` is relative to the Project with `/` separators. The host keeps one current Project (one window).

## Notes from ticket 05 (for 06, 07, 12–14)

- **View mechanism:** a `<webview>` (`src/renderer/src/editor/DocumentView.tsx`), created by hand so its `partition` (`persist:margen-doc`) is set before it navigates. Main's `will-attach-webview` rejects any other partition or a non-`margen-doc://` src, and forces `sandbox`, `contextIsolation`, no Node, and `src/preload/document.ts` as its preload. It is a DOM element, so renderer overlays stack above it. Margen's script is the preload (isolated world), not a `<script>` spliced into the response: the page can't see or spoof it, and the served HTML is byte-for-byte the file. HTML without a `<meta charset>` is served as UTF-8 (`documentFile` in `src/main/projects/document.ts`).
- **Host API:** `document.open(path)`, `document.current`, `document.close`, `document.openInBrowser`; events `document.opened` (OpenDocument | null) and `document.updated` ({ path }, debounced 200 ms). The reload watch fires for the Document and for any non-HTML file in the Project (CSS, JS, images), skipping other HTML files, dotfiles and ignored folders. Leaving the Project closes the Document. `App.tsx` shows the editor whenever `document.current` is set.
- **Navigation in the view:** `will-navigate` is always prevented; http(s) links and `window.open` go to the default browser, and a link to another Document of the Project opens it in the editor (via `document.open`). In-page `#hash` links still work.
- **Bridge:** `src/shared/document-bridge.ts`: `FromDocument` (`ready`, `scroll`) and `ToDocument` (`restore-scroll`) on one channel, `ipcRenderer.sendToHost` ↔ `webview.send`. `parseFromDocument` checks everything coming from the guest; add new message types there. The editor side is `connectDocument(view)` in `editor/bridge.ts`; `DocumentView` hands the bridge to its parent through `onReady(bridge | null)` (`null` while reloading).
- **06 (Viewport):** the frame is the `role="region" aria-label="Document view"` div in `EditorScreen.tsx`. It fills the stage (`size-full`, `mx-auto`); set its CSS width for Tablet/Mobile and keep the height. The Viewport select goes where the comment in the top bar's right group is, before "Open in browser". The webview resizes with its container, so no Electron call is needed.
- **07 (chat):** `ChatPanel` in `EditorScreen.tsx` is a placeholder (header + empty text), `aria-label="Chat"`, 370px wide as in the prototype.
- **12–14 (Pick, Draw, toolbar):** the overlay layer goes inside the frame div, after `<DocumentView>`, positioned `absolute inset-0` (a comment marks the spot). The stage's `pb-24` leaves room for the floating toolbar, which should be `absolute` in the stage's parent (the `relative flex-col` div that also holds the Reloaded notice). For geometry, add messages to the bridge: the preload answers in the guest's CSS px, relative to the guest viewport, which is the frame's box (no offset inside the frame). For Pick/Draw input isolation the preload adds capture-phase listeners; for Draw the canvas can sit over the webview (pointer-events on in Draw only). Screenshots: `webview.getWebContentsId()` → a host call → `webContents.fromId(id).capturePage(rect)` in main (device px; wrap in a timeout, it stalls on hidden windows), or capture the host window's rect to include renderer-drawn strokes. Seam 2 can reach the guest with `inDocument(app, expr)` (`e2e/editor.spec.ts`).
- **Scroll restore:** the preload reports scroll (100 ms throttle); after a reload the editor sends `restore-scroll`, which the preload reapplies on load and `fonts.ready` and holds for 2.5 s or until the user scrolls, clicks or types. The e2e fixture sets `history.scrollRestoration = 'manual'`, so the test fails without Margen's restore. The glow on changed elements (story 32) is not built; it needs the last Turn's Annotations (12+).
