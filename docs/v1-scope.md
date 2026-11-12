# Margen v1: agreed scope

Settled in the grilling session on 2026-11-11. Terms follow `GLOSSARY.md`; the decisions behind them are in `docs/adr/`.

## Product
- **Margen**: the first open-source part of Margin, in its own repo. MIT, free. No telemetry and no crash reporting.
- Mac first: a signed and notarized `.dmg` on GitHub Releases with auto-update (we already have an Apple Developer account). Windows later. Nothing in the design should rule Windows out.
- Light mode only, in Margin's design language (grey shell, white card, Inter, the Fraunces "margen" wordmark, black buttons). The accent is blue (#2f7bff): Pick and Draw highlights, strokes, numbered markers and chips.

## Agent
- v1 supports Claude Code only, through the Agent SDK pointed at the user's own `claude` binary and login. Codex comes in v1.1, behind the same `AgentProvider` interface (ADR 0002).
- First run detects `claude` and walks the user through the official installer and `claude auth login`. Margen never handles credentials.
- **Editor permission preset**: file reads and writes inside the Project and web search/fetch are auto-approved. Shell commands and anything outside the Project need approval. A setting switches to "allow everything".
- The Composer has a model and effort picker that defaults to Claude Code's own default.

## Projects and Documents
- After onboarding, the first screen offers: **Open a folder** (any folder becomes a Project) or **New project** (an empty folder at `~/Documents/Margen/<name>`), plus recent Projects.
- The Project page has a "Let us build …" chat bar and, under it, a grid of every HTML file in the Project (ignoring `node_modules`, `.git` and build output). Clicking a file opens it in the editor.
- A Document is one HTML file. Its scripts run and it has network access, inside a sandboxed frame with no Node access.
- Margen is a viewer and annotator, and the Agent edits the Document. The one exception (added 2026-11-12): double-clicking an element's plain text in Browse edits it in place, and ↵ writes it to the file at that element, after a Checkpoint. Text with tags inside or written by a script is left to the Agent, and hand edits wait while a Turn runs. Margen watches the file and live-reloads, keeping scroll position.
- One active Session per Document, plus a history of past Sessions that can be resumed. Switching Documents switches the chat. The Agent can still read and change any file in the Project.
- The Project page's chat bar starts a Turn and lands in the editor: a description creates a new Document and opens it with the Turn running, and an `@`-mentioned file opens that Document with the message sent.
- A Checkpoint is taken automatically before every Turn, with "Revert to here" in the chat. Checkpoints belong to one Document (changed 2026-11-12: you work on one file at a time): each Document has its own list and numbers, and a revert restores only that Document's file. Margen never touches the user's own git.

## Editor
- The Document is on the left and the chat panel on the right.
- A floating toolbar at the bottom has the Modes **Browse / Pick / Draw**, each its own button.
- A **Viewport** select sits on the right of the editor's top bar. It shows the current one and its width (Desktop by default, fitted to the window) and offers Tablet (820px) and Mobile (390px). Next to it, **Fit** lays the Document out at a whole screen (Desktop 1440×900, Tablet 820×1180, Mobile 390×844) and scales it down to fit, for slide decks and full-screen pages. A button at the end of the top bar hides and shows the chat.
- **Pick**: hover highlights elements and a click makes a Pick Annotation, sent with a screenshot of the element. Arrow keys move the highlight to any element on the page: ←/→ previous/next element in reading order, ⇧←/⇧→ previous/next sibling (skipping what is inside), ↑ parent, ↓ first child, ↵ picks, Esc leaves.
- **Draw**: one freehand tool for both pointing and making. Draw anything (circle what you mean, or sketch a shape or text) and add a comment, and the Agent works out what to do from both. Elements mostly enclosed by a stroke light up live, and each stroke reduces to the smallest element that contains what it encloses. More strokes join the open drawing until it's sent. Margen sends a screenshot with the strokes, a crop of the strokes alone, their bounding box and the elements they caught.
- **Composer**: one draft, shown in two places (a quick input next to the newest Annotation on the canvas, and the chat panel). In the quick input, Enter sends and ⌘Enter adds the Annotation to the message.
- Pending Annotations show as numbered markers on the canvas and matching chips in the Composer. Once sent, the markers fade and thumbnails stay in the chat. Pick markers follow their element; Draw strokes stay fixed to page coordinates.
- **Queue**: anything sent while a Turn is running waits in the Queue and goes out as its own Turn, in order.
