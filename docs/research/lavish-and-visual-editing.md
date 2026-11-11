# Lavish and visual "point-at-it" editing for coding agents

Researched 2026-11-10. Confidence markers: **[verified]** = read in the primary source (repo code, official docs). **[secondary]** = only from third-party write-ups or marketing pages. **[uncertain]** = inferred, or the sources disagree.

---

## 1. Lavish (`lavish-axi`), found with high confidence

| | |
|---|---|
| Repo | https://github.com/kunchenguid/lavish-axi (npm `lavish-axi`, v0.1.96 on 2026-10-29) [verified] |
| Author | Kun Chen (@kunchenguid). He also defined the AXI agent-CLI conventions at https://axi.md [verified] |
| License | MIT, (c) 2026 Kun Chen [verified, `LICENSE`] |
| Age | The CHANGELOG starts around v0.1.3 on 2026-05-12, so the project is about 6 months old and releases often [verified] |
| Tagline | "HTML is the new markdown. Lavish is the new editor for your HTML artifacts." |

### What it is
A **local CLI plus a local web server**. It opens an HTML file that an agent wrote in a browser tab. The human annotates elements or text, and the feedback goes back to the agent through a **long-poll CLI command**. It is not a browser extension, not a desktop app and not an MCP server: "Lavish declares no MCP server - the CLI itself is the agent interface" (README). It reaches agents through:
- an Agent Skill (`npx skills add kunchenguid/lavish-axi --skill lavish`), a short stub that points the agent at `npx -y lavish-axi --help`
- optional `SessionStart` hooks for Claude Code, Codex, OpenCode and Copilot CLI (`lavish-axi setup hooks`)
- an Agent Plugin for VS Code, Cursor and Copilot CLI

### How it works [verified, README + `src/`]
1. The agent writes `artifact.html` (often under `.lavish/`) and runs `lavish-axi <file>`. A detached Express server starts and the browser opens.
2. The artifact renders in a **sandboxed iframe** (no same-origin access) inside Lavish's "chrome" UI. The server injects **exactly one `<script>` tag (the SDK) at the parser-reported `</body>`** and nothing else. The saved file renders the same with or without Lavish (see `VISION.md`, changelog 0.1.96).
3. Iframe and chrome talk over `postMessage` (`src/artifact-sdk.js`, for example a `lavish:snapshot` message).
4. The agent runs `lavish-axi poll <file>`, which blocks until the user clicks **Send**. The output is TOON, a token-efficient structured text format. The agent edits the file, then replies with `poll --agent-reply "..."` or `lavish-axi reply`.
5. Sessions are keyed by the **canonical file path**, so the agent does not need to track an opaque ID.

### Element → source mapping [verified, `src/artifact-sdk.js`]
- **No source maps and no injected data-ids.** Lavish works on a raw HTML file, so the clicked DOM element is the source.
- Each annotation carries a `context()` object with these fields:
  - `uid`: a per-load counter kept in a WeakMap
  - `selector`: a CSS path of up to 5 ancestors, built from `tag` plus `:nth-of-type(n)`, which stops early at the first ancestor with an `#id`
  - `tag`
  - `text`: innerText, whitespace-collapsed, max 240 characters
- Tables also get semantic **row and column header names**. If merged cells make a name ambiguous, Lavish leaves that name out rather than guessing.
- Clicks inside a Mermaid diagram are lifted to the `<g>` node, and the annotation gets `tag: "mermaid-node"` plus the node's label.
- Text selections carry the selected text plus **range anchors**.
- An optional **DOM snapshot** goes with each Send: an indented outline (`uid=12 h2 "Title"`, depth up to 6). If it takes more than 5 s, the send goes ahead without it, and it is dropped and retried if the request hits HTTP 413.
- Image attachments are stored on disk, and the agent receives an **absolute file path** instead of the image bytes.

### UX ideas worth copying
- **Annotate and explore modes** (Cmd/Ctrl+I). Native controls and ARIA widgets stay interactive in annotate mode. Cmd-click on a link follows it.
- **A queue before send**: notes sit as dashed "Queued" bubbles that you can edit or remove, then **Send to Agent** or **Send & End** delivers them all at once.
- **Delivery receipts**: 👀 Seen (a poll took the note) → 🛠️ Working (the file changed) → ✅ Done (the agent replied). All three are inferred by the server, so the agent does nothing extra.
- **Live reload** with a chokidar file watch. Reloads keep the iframe scroll position, unsent annotation text and form answers. State is saved in `sessionStorage`.
- **Revisions legend**: the agent can tag changed blocks with `data-lavish-revision="id"` and add a JSON registry. Reviewers can then step through what changed in each round.
- **Layout issues inbox**: passive in-iframe checks for overflow, clipping and occlusion. Findings go into an inbox, and nothing reaches the agent until the user queues a fix.
- **Mermaid → Excalidraw whiteboard**: diagrams become editable. The agent receives an edit summary plus the `.excalidraw` scene and PNG paths, and the Mermaid source stays authoritative.
- **Feedback controls**: `window.lavish.queuePrompt()` and `data-lavish-question` let the artifact itself collect structured answers, like a form.

### Limitations
- One person, one agent, one local HTML file. It is not built for multi-user collaboration or for framework apps with source mapping (`VISION.md`).
- **No freehand drawing on the page itself.** I found no pen or freehand tool in the README or SDK. The only drawing surface is the Mermaid→Excalidraw whiteboard. [verified by grep, uncertain whether it is planned]
- Root-relative asset paths (`/assets/x.png`) do not resolve. Local assets must use relative paths.
- Selectors are positional (`nth-of-type`), so they can break if the agent restructures the page between rounds.
- Telemetry (Umami) is on by default in the npm build. Turn it off with `LAVISH_AXI_TELEMETRY=0`.
- Codex has to keep the poll in the foreground, because a completed background task may not resume the agent.

---

## 2. Similar tools

| Tool | Selection / mapping | Drawing / annotation | Context to agent | Notable |
|---|---|---|---|---|
| **Claude Code Desktop Browser pane** | "Select an element" tool (Cmd+Shift+S) [verified, https://code.claude.com/docs/en/desktop.md] | A pencil "Annotate" button is mentioned in a third-party issue report. It is not in the official docs [uncertain] | The selector (e.g. `<h1>.text-2xl.font-bold`) plus a screenshot of the element are attached to the prompt [secondary, https://azukiazusa.dev/blog/claude-code-preview.md] | Auto-verify: after edits Claude takes screenshots, inspects the DOM and clicks through. In-app external browsing shipped July 2026 (https://code.claude.com/docs/en/whats-new/2026-w28) |
| **Claude in Chrome** | The agent drives the browser, not the user | none | DOM, console, screenshots, GIF recording, through an MCP server (`claude-in-chrome`) [verified, https://code.claude.com/docs/en/chrome.md] | Shares your real logins. It is an agent tool, not a point-and-annotate tool |
| **Cursor Browser visual editor** (2.2, Dec 2025) | Click or hover elements; shows the React component tree and props | Drag and drop in the rendered DOM; a style sidebar with sliders and tokens | Visual tweaks are batched, then **Apply** runs the agent to write code. Point-and-prompt runs several in parallel [verified, https://cursor.com/blog/browser-visual-editor] | Edit visually first, have the agent write code later |
| **Agentation** (Benji Taylor, Dennis Jin, Alex Vanderzon) | A React overlay. CSS selector plus React component path plus **source file:line** (Vite, Next, Webpack, Turbopack) | Text selection, animation pause. Area selection unclear [uncertain] | Markdown in 4 detail levels (Compact, Standard, Detailed with bounding box and nearby text, Forensic with computed styles). Copy-paste, or **MCP** where the agent can list, clarify and resolve annotations, plus webhooks [verified, https://www.agentation.com/output] | Free for internal use; commercial redistribution needs a license |
| **React Grab** (Aiden Bai) | Hover plus Cmd+C. React fiber → component plus `file:line:col` | none | Clipboard text such as `[Forgot your password? in LoginForm (at components/login-form.tsx:46:19)]` [verified, https://github.com/aidenybai/react-grab] | MIT. Smallest workable design: one keystroke, one line of context |
| **Stagewise** | Started as a toolbar; now an "agentic IDE" built around a browser | | The agent gets the tab's console and debugger; bring your own API key [verified, https://github.com/stagewise-io/stagewise] | AGPLv3. Account service sunsets Nov 2026 |
| **Onlook** | Injects **`data-oid`** attributes into JSX through AST instrumentation. Its system prompt tells the LLM never to touch them [verified, `packages/constants/src/editor.ts`, `packages/ai/src/prompt/constants/system.ts`] | Draw new divs; Figma-like drag and drop | The AI gets code tools plus image references | Apache-2.0. Uses a CodeSandbox container with an iframe preview |
| **Lovable Visual Edits** (Mar 2025) | A custom **Vite plugin assigns stable IDs to every JSX element** at compile time; reverse lookup goes DOM → JSX | Figma-like property panel | The whole project lives in the browser as a Babel/SWC **AST**. Edits are applied as AST changes with optimistic Tailwind generation, then diff → server → HMR. No LLM call for simple edits [verified, https://lovable.dev/blog/visual-edits] | Deterministic edits need no model and use no credits |
| **v0 Design Mode** | Option+D, hover-highlight, click | Design panel (copy, typography, spacing, delete) | Panel edits write code directly **without using credits**; prompt edits use the model [secondary, https://community.vercel.com/t/introducing-design-mode-on-v0/13225] | Same deterministic-first split as Lovable |
| **Bolt Visual Edits / Inspector** | "Select" in the chatbox; Cmd-click goes into nested elements | Toolbar for text, size and colour | **Many changes are stacked, then sent to the model in one batch** [secondary, https://bolt.new/blog/visual-edits, https://support.bolt.new/building/visual-edits] | Batching, like Lavish's queue |
| **Drawbridge** (breschio) | Chrome extension. `C` = click-comment, `R` = **drag a rectangle** | Rectangle regions | Writes `.moat/moat-tasks.md`, `.moat/moat-tasks-detail.json` (selector, element context, **bounding box**) and `.moat/screenshots/`. The agent runs `/bridge` [verified, https://github.com/breschio/drawbridge] | **File-based handoff**: the repo is the message bus. Custom non-commercial license |
| **ZingIt** (Dan Wahlin) | `Z` mode, "smart CSS selectors" | Element screenshots | A local WebSocket server (`npx @codewithdan/zingit`) passes marks to Claude Code, Copilot CLI or Codex [verified, https://github.com/DanWahlin/zingit] | MIT |
| **Pinta** | Chrome extension plus companion server | **Circle, point or drag a rectangle**; full-page screenshot composite | Structured CSS-diff payload; Claude Code adapter plus MCP for Cursor, Cline and Zed [secondary, https://kevzlou7979.github.io/pinta/ ; the repo returned 404 for me] | The closest match to "draw a circle → agent" |
| **AgentsRoom Sketch** | n/a | Canvas with rect, arrow, text and freehand over a blank page or an image | Exported as a **plain PNG attachment passed by path** [secondary, https://agentsroom.dev/docs/sketch] | The simplest freehand approach |
| **tldraw Make Real** (Nov 2023) | Select shapes on the canvas | Freehand canvas | Sends a **screenshot of the selection, the text of the shapes, and the previous HTML**. The output is HTML in an iframe shape, and iteration works by drawing on top of the previous output [verified, https://tldraw.dev/blog/make-real-the-story-so-far] | The prompt trick: export the iframe as a white box and tell the model to "fill in the white box with this provided HTML" |
| **Excalidraw wireframe→code** | Select frame | Hand-drawn wireframe | Image of the frame → generated HTML [secondary, little primary documentation found] | |

Other tools I came across but did not examine: Browser Annotations (DevTools extension), Shiteki, MarkUp, Redline, Pointa, Element Select, Tidewave Inspector.

---

## 3. Technical approaches for a standalone HTML file in an iframe or webview

### (a) Element picking and stable identification
- **Pick**: in an injected script, use capture-phase `pointermove` with `document.elementFromPoint` or `event.composedPath()[0]`. Draw the highlight as an overlay outside the content, either a separate fixed div with `pointer-events:none` or in the parent frame from `getBoundingClientRect()`, so the page's own DOM is not changed. Lavish keeps its own UI out of the artifact.
- **Identify with several fallbacks, sent together**:
  1. `#id` or an existing `data-*` key when there is one
  2. a short CSS path (`tag:nth-of-type` up to the nearest id; this is Lavish's approach)
  3. `outerHTML` cut to about 300–500 characters plus trimmed `innerText`. This is what the agent actually greps for in the file.
  4. **Source line range**: parse the file with parse5 or htmlparser2 and its `sourceCodeLocation` (see [uncertain] below), keep a map from element → `[startLine, endLine]`, and look it up by structural path. For a raw HTML file this gives the agent an exact edit target.
- **Injected data-ids (Onlook, Lovable)** are the most robust, but they change the file, or need a serve-time transform that the agent never sees. For one HTML file, a serve-time transform is a good middle ground. Add `data-oid` only in the served copy, keep the map oid → source offsets on the server, and recompute it after each write. That matches Lavish's rule that the file on disk is never changed. [design recommendation; the sourceCodeLocation detail is my inference, uncertain]
- Selectors **break after the agent rewrites the file**. Re-resolve queued annotations after reload by text and outerHTML similarity, and show "target gone" when there is no match. Lavish handles this by moving the note into "Unsent annotation".
- **Cross-origin and sandboxing**: a sandboxed iframe without `allow-same-origin` needs a `postMessage` protocol (Lavish does this). With `srcdoc` or a same-origin server you can reach `contentDocument` directly, which is simpler but less isolated.

### (b) Freehand drawing → agent context
- Put a **transparent canvas or SVG over the iframe** in the parent and toggle it with a "draw" mode. Store strokes as point arrays in page coordinates, with scroll offset added, so they survive scrolling.
- Send the agent **both** of these:
  1. **An annotated screenshot**: render the viewport or full page (the webview capture API, `html2canvas`/`modern-screenshot`, or CDP `Page.captureScreenshot`) and composite the strokes on top. Save it as a PNG and **pass it by path**, as Lavish, AgentsRoom and Drawbridge do. Do not inline base64.
  2. **Structured hits**: take the stroke's bounding box, or sample points along it, and call `elementsFromPoint` / check rect intersection. Keep the **smallest meaningful elements** that are mostly inside the stroke's area (a circle around a button should give the button, not `<body>`). Emit their selector, outerHTML snippet, line range and bounding box (Drawbridge and Agentation both include bounding boxes), plus a shape classification (circle, arrow from A→B, strike-through, rectangle) and the user's note.
- Arrows are worth special handling: the element at the tail and the element or location at the head become "move X to Y".

### (c) Live reload after the agent writes
- Watch the file on the server (chokidar/fs.watch with debounce; Lavish uses chokidar) and push over SSE/WebSocket. Then the iframe reloads, or gets a new `srcdoc`.
- Before reloading, save the iframe scroll position, the open annotation draft, the queue and form state, and restore them afterwards. Lavish keeps these in `sessionStorage`.
- Group closely spaced writes into one reload (agents often write several times). Optionally watch sibling assets.
- For a single file you could also do a **DOM morph** (idiomorph, morphdom) instead of a full reload. That keeps state better, but scripts do not re-run [uncertain trade-off; a full reload is safer].
- Mark what changed. Diff the old and new DOM, or have the agent tag blocks (`data-lavish-revision`), then flash the changed blocks after the reload.

### (d) Turning a sketch into something the agent adds to the page
- Use tldraw's pattern: **screenshot of the sketch + any text labels + the current HTML + where to insert**. The insertion anchor is the element nearest or under the sketch, given as selector + line range and before/after/inside.
- Tell the model the sketch's **pixel size and position relative to the surrounding elements**, and the page's existing styles and classes, so the new content matches the rest of the page.
- Iterate by drawing again on top of the rendered result (tldraw's loop). Lavish's Mermaid→Excalidraw handoff is a structured version of this: it sends an edit summary plus the scene file instead of only pixels.
- Apply deterministic edits without the model: text, colour and spacing changes can be applied directly (Lovable and v0 do this for free). Send only structural or creative changes to the agent.

---

## Sources
- Lavish: https://github.com/kunchenguid/lavish-axi (README, VISION.md, CHANGELOG.md, src/artifact-sdk.js), https://axi.md
- Claude Code: https://code.claude.com/docs/en/desktop.md, https://code.claude.com/docs/en/chrome.md, https://code.claude.com/docs/en/whats-new/2026-w28, https://azukiazusa.dev/blog/claude-code-preview.md
- Cursor: https://cursor.com/blog/browser-visual-editor
- Agentation: https://www.agentation.com/, https://www.agentation.com/output
- React Grab: https://github.com/aidenybai/react-grab
- Stagewise: https://github.com/stagewise-io/stagewise
- Onlook: https://github.com/onlook-dev/onlook
- Lovable: https://lovable.dev/blog/visual-edits
- v0: https://community.vercel.com/t/introducing-design-mode-on-v0/13225
- Bolt: https://bolt.new/blog/visual-edits, https://support.bolt.new/building/visual-edits
- Drawbridge: https://github.com/breschio/drawbridge
- ZingIt: https://github.com/DanWahlin/zingit
- Pinta: https://kevzlou7979.github.io/pinta/
- AgentsRoom: https://agentsroom.dev/docs/sketch
- tldraw: https://tldraw.dev/blog/make-real-the-story-so-far
