# Margen v1: the desktop app

Status: ready-for-agent

## Problem Statement

People who pay for Claude Code (and soon Codex) can already ask an Agent to write an HTML page, but steering it afterwards is clumsy. To change one heading, tighten one card grid or add a badge in one corner, they have to describe *where* in words ("the second card, the bit under the price…"), switch between a terminal and a browser, reload by hand, and hope the Agent edits the right element. The apps that wrap Claude Code are built for coding whole repositories, not for looking at a page and pointing. The tools that let you click on a page to talk to an Agent (Lavish, Onlook, Cursor's browser) can't take a freehand drawing, need a dev server or a framework, or don't use the subscription the person already pays for.

## Solution

Margen is a free, open-source (MIT) desktop app, Mac first, that puts the Document and the Agent side by side. You open any folder as a Project, or start a new one. Margen lists every HTML file in it, and opening one shows it live on the left with a chat on the right, driven by the Claude Code already installed and signed in on your Mac. A floating toolbar switches between **Browse** (use the page normally), **Pick** (click an element, or move between elements with the arrow keys) and **Draw** (circle, scribble or sketch anything). Each pick or drawing becomes a numbered Annotation with a comment. Annotations collect in the Composer and go to the Agent as one Turn, with selectors, HTML snippets and screenshots. The Agent edits the file on disk, Margen reloads it while keeping the scroll position, and a Checkpoint before every Turn lets you undo it. Margen never edits the Document itself and never touches your Claude login.

## User Stories

### Onboarding

1. As a new user, I want Margen to detect whether Claude Code is installed, so that I know straight away whether I can start.
2. As a new user without Claude Code, I want a one-click Install that runs Anthropic's official installer, so that I don't have to find and paste a terminal command.
3. As a new user, I want a Sign in button that opens Terminal running `claude auth login`, so that I sign in with Claude's own tool and Margen never sees my credentials.
4. As a new user, I want each onboarding step to show its state (missing, working, done, failed), so that I know what's left to do.
5. As a new user, I want Continue to unlock only when Claude Code is installed and signed in, so that I don't reach an editor that can't work.
6. As a returning user, I want to skip onboarding when Claude Code is still installed and signed in, so that the app opens straight to my work.
7. As a user whose `claude` login expired, I want Margen to tell me and offer Sign in again, so that a failed Turn isn't a mystery.
8. As a privacy-minded user, I want Margen to send no telemetry and no crash reports, so that nothing about my files or prompts leaves my machine through Margen.

### Start screen

9. As a user, I want the first screen after onboarding to offer "Open a folder" or "New project", so that I start every session from my work.
10. As a user, I want to open any folder (a website's code, a folder of HTML files, a brand kit) as a Project, so that the Agent can read everything in it.
11. As a user, I want "New project" to ask for a name and create an empty folder under `~/Documents/Margen/`, so that starting from nothing takes one step.
12. As a user, I want a list of recent Projects with how many HTML files each has and where it lives, so that I can get back to one in a click.
13. As a user, I want ⌘O to open a folder and ⌘N to start a new project, so that I can do both without the mouse.
14. As a user, I want to clear the recent list, so that I can tidy it.
15. As a user, I want a recent Project whose folder was moved or deleted to say so instead of failing silently, so that I understand what happened.

### Project page

16. As a user, I want the Project page to list every HTML file in the Project as a grid of Documents, so that I can see everything I can open.
17. As a user, I want `node_modules`, `.git` and build output left out of that grid, so that it only shows files I care about.
18. As a user, I want each Document to show its name, its subfolder and when it was last edited, so that I can tell similar files apart.
19. As a user, I want each Document to have a stable generated cover in Margin's style, so that I recognise files at a glance.
20. As a user, I want clicking a Document to open it in the editor, so that I can start working on it.
21. As a user, I want a "Let us build …" chat bar on the Project page, so that I can start something new without opening a file first.
22. As a user, I want describing something new in that bar to create a new Document and open it with the Agent already working, so that I see it being built.
23. As a user, I want `@`-mentioning an existing file in that bar to open that Document with my message sent, so that I can ask for a change from the Project page.
24. As a user of a new, empty Project, I want a clear "Nothing here yet" state that points at the chat bar, so that I know how to begin.
25. As a user, I want the grid to update when files are added, renamed or removed on disk, so that it matches the folder.
26. As a user, I want a project switcher and a way back to the Start screen, so that I can move between Projects.

### Editor: viewing the Document

27. As a user, I want the Document rendered live on the left and the chat on the right, so that I can see the page and talk about it at once.
28. As a user, I want the Document's own scripts to run and its CDN fonts and libraries to load, so that interactive pages look and behave as they really do.
29. As a user, I want the Document kept in a sandbox with no access to my computer, so that opening an HTML file can't harm my machine.
30. As a user, I want Margen to reload the Document when the file changes on disk, so that I see each edit as soon as the Agent makes it.
31. As a user, I want my scroll position kept across reloads, so that I don't lose my place on every edit.
32. As a user, I want a short "Reloaded" notice and a glow on the elements that changed, so that I can see what the Agent touched.
33. As a user, I want a Viewport select on the right of the top bar showing the current width (Desktop by default, fitted to the window), so that I always know what width I'm looking at.
34. As a user, I want to switch the Viewport to Tablet (820px) or Mobile (390px), so that I can check and annotate the page at other widths.
35. As a user, I want a breadcrumb (margen / Project / Document) with a dropdown of the Project's other Documents, so that I can switch file without going back.
36. As a user, I want an "Open in browser" button, so that I can check the page in my real browser.

### Editor: Modes and the toolbar

37. As a user, I want a floating toolbar at the bottom with Browse, Pick and Draw, so that the tools are always within reach.
38. As a user, I want the keyboard shortcuts V, P and D for the Modes, so that I can switch without the mouse.
39. As a user, I want Esc to go back to Browse, so that I can always get out of a tool.
40. As a user, I want a short hint when I switch Mode, so that I learn what each Mode does.
41. As a user in Browse, I want to click links, buttons and tabs in the Document normally, so that I can use the page as a visitor would.
42. As a user in Pick or Draw, I want my clicks not to trigger the page's own links or scripts, so that pointing never navigates away.

### Pick

43. As a user in Pick, I want the element under my mouse highlighted with its selector, so that I know what a click will pick.
44. As a user, I want clicking a highlighted element to make a Pick Annotation, so that I can point at it precisely.
45. As a user, I want the arrow keys to move the highlight to any element on the page (← and → for previous and next in reading order, ↑ for parent, ↓ for first child), so that I can reach elements that are hard to hit with the mouse.
46. As a user, I want ↵ to pick the highlighted element, so that I can pick without the mouse.
47. As a user, I want the page to scroll to keep the keyboard highlight in view, so that I never lose it.
48. As a user, I want a small key guide while I move with the arrow keys, so that I remember the keys.

### Draw

49. As a user in Draw, I want to draw freehand anywhere on the Document, so that I can point roughly or show what I want.
50. As a user circling something, I want the elements my stroke mostly encloses to light up while I draw, so that I can see what Margen caught before I let go.
51. As a user, I want a circle around several related elements to resolve to the smallest element containing them all, unless that element is much bigger than my circle, so that "this card grid" means the grid, not the whole section.
52. As a user, I want to add more strokes to the same drawing while its comment box is open, so that I can sketch something made of several lines.
53. As a user, I want to write one comment for a drawing and let the Agent work out from the comment and the strokes whether I'm pointing at something or asking for something new, so that I don't choose a tool for each intent.
54. As a user drawing on empty space, I want the drawing still sent, with where it is on the page, so that I can sketch something to add there.
55. As a user, I want the comment box to keep my typing focus when I add a stroke, so that I can draw and type without clicking back in.

### Annotations and the Composer

56. As a user, I want each new Annotation to open a small comment box next to it, so that I can say what I want right where I'm looking.
57. As a user, I want ↵ in that box to send the message straight away, so that a single quick change takes one step.
58. As a user, I want ⌘↵ or "Add" to attach the Annotation to my message and keep annotating, so that I can collect several Annotations before sending.
59. As a user, I want Esc or ✕ in the comment box to discard that Annotation, so that mistakes are easy to undo.
60. As a user, I want every pending Annotation shown as a numbered marker on the Document and a matching chip in the Composer, so that I can see what will be sent.
61. As a user, I want clicking a chip to reopen that Annotation's comment box, so that I can edit it before sending.
62. As a user, I want to remove a chip with its ×, so that I can drop an Annotation without finding it on the page.
63. As a user, I want Pick markers to follow their element when the layout moves, so that they stay on the right thing.
64. As a user, I want the Composer in the chat panel to show the same draft as the comment box, so that I can finish a message in whichever place is handy.
65. As a user, I want to send a message with no Annotations at all, so that I can ask general questions or request page-wide changes.
66. As a user, I want markers to fade from the Document once sent, with thumbnails of each Annotation kept in the chat, so that the page is clean again but the history stays.
67. As a user, I want each Annotation to record the Viewport width it was made at, so that the Agent knows "this overlaps" was seen on mobile.

### Turns, the Queue and interrupting

68. As a user, I want to watch the Agent's Turn stream into the chat (its thinking state, the files it reads and edits with lines added and removed, then its reply), so that I can follow what it's doing.
69. As a user, I want to keep annotating and writing while a Turn runs, so that I don't sit and wait.
70. As a user, I want anything I send during a Turn to wait in a visible Queue and go out as its own Turn, in order, so that my follow-ups aren't lost or merged.
71. As a user, I want to remove a queued message before it sends, so that I can change my mind.
72. As a user, I want a Stop button (and Esc when nothing else is open) to interrupt the running Turn, so that I can halt an Agent heading the wrong way.
73. As a user, I want queued messages to wait after I interrupt rather than send at once, so that stopping really stops.
74. As a user, I want to pick the model and reasoning effort in the Composer, defaulting to Claude Code's own default, so that I can trade speed for quality.

### Permissions

75. As a user, I want the Agent to read anything in the Project and write files inside it without asking, so that normal editing flows without interruptions.
76. As a user, I want web search and fetch allowed without asking, so that the Agent can find images, fonts and references.
77. As a user, I want an approve/deny card in the chat before the Agent runs a shell command or touches anything outside the Project, so that it can't surprise me.
78. As a user, I want to allow a request once, so that I keep control without turning protection off.
79. As a user who trusts the Agent, I want an "Allow everything" setting, so that I'm never asked.
80. As a user, I want the active permission preset shown in the Composer, so that I always know how much the Agent may do.

### Checkpoints

81. As a user, I want Margen to take a Checkpoint of the Project automatically before every Turn, so that any Turn can be undone.
82. As a user, I want "Revert to here" at each Checkpoint in the chat, so that I can go back to how things were before that Turn.
83. As a user, I want a Checkpoints list for the Project, shared by every Session and Document, so that I can go back even after changing chats.
84. As a user, I want Checkpoints that never touch my own git repository, so that Margen doesn't make commits or change branches in my code.
85. As a user, I want reverting to restore every file the Turn changed, not just the open Document, so that a Turn that also edited shared CSS is fully undone.

### Sessions

86. As a user, I want each Document to have its own active Session, so that the chat on the right is always about the page I'm looking at.
87. As a user, I want switching Documents to switch the chat, so that conversations don't mix.
88. As a user, I want the Agent to still read and change other files in the Project during a Document's Session, so that it can edit shared styles or link pages together.
89. As a user, I want to start a new Session for a Document, so that I can start fresh without losing the old one.
90. As a user, I want to see and resume a Document's past Sessions, so that I can pick up an earlier conversation.
91. As a user, I want my Sessions to survive quitting and reopening Margen, so that work isn't lost.

### Settings and distribution

92. As a user, I want Settings to show where Claude Code is installed, its version and whether I'm signed in, so that I can fix setup problems.
93. As a user, I want Settings to show Codex as coming in 1.1, so that I know it's planned.
94. As a user, I want to switch between the Editor preset and Allow everything in Settings, so that I control permissions in one place.
95. As a Mac user, I want a signed and notarized download from GitHub Releases, so that macOS opens it without warnings.
96. As a user, I want Margen to update itself, so that I get fixes without reinstalling.
97. As a contributor, I want the source under MIT, so that I can read, fork and improve it.

## Implementation Decisions

**Shell and processes**
- Electron (ADR 0001). The main process owns everything that touches the disk or the Agent. The renderer only draws the UI and the Document.
- A single, typed **host API** between renderer and main is the only way the UI acts on the world: open or create a Project, list its Documents, watch a Document, start a Turn, queue and unqueue messages, interrupt, answer an approval, list and revert Checkpoints, list, start and resume Sessions, read and update Settings, and run onboarding checks. Events (Turn progress, Document changed, Documents list changed, approval requested) flow back over the same API as a typed event stream. This is the primary test seam.
- Built fresh, copying individual MIT modules from T3 Code where they fit (Claude session, queue and interrupt handling; the `codex app-server` client later; the preview pick preload), with T3's copyright notice kept (ADR 0003). No code from AGPL projects.

**Agent integration**
- An **AgentProvider** interface hides which Agent is running. v1 ships one implementation over the Claude Agent SDK, pointed at the user's own installed `claude` binary and its login. Margen never offers a login, and never reads, stores or forwards tokens (ADR 0002). The interface is designed against both the Agent SDK and `codex app-server` so Codex can be added in 1.1 without changing it. Its shape, roughly:

  ```ts
  interface AgentProvider {
    detect(): Promise<{ installed: boolean; version?: string; signedIn: boolean; plan?: string }>
    startSession(opts: { projectDir: string; model?: string; effort?: string; resumeId?: string }): Session
  }
  interface Session {
    id: string
    send(turn: TurnInput): void          // TurnInput = text + Annotations (see below)
    interrupt(): Promise<void>
    events: AsyncIterable<AgentEvent>    // thinking | text | tool (read/edit/write, file, +/−) | approval-request | turn-end | error
    answerApproval(id: string, decision: "allow-once" | "deny"): void
  }
  ```
- The Agent runs with the Project folder as its working directory. The **Editor permission preset** maps onto the SDK's tool-permission callback: reads anywhere in the Project, plus writes and edits inside it, and web search and fetch are allowed. Shell commands and any path outside the Project produce an approval request. "Allow everything" approves all requests.
- Margen talks to the Agent through one long-lived Session per Document, which is what makes interrupting and resuming possible. The Queue lives in Margen: each queued message goes out as its own Turn only after the previous Turn ends. After an interrupt, the Queue is held until the user sends again.

**Projects, Documents and watching**
- A Project is a folder. Documents are found by scanning it recursively for `.html` files, skipping `node_modules`, `.git`, common build folders (`dist`, `build`, `.next`, `out`) and anything the folder's `.gitignore` excludes. Margen watches the folder and pushes changes to the Documents list.
- Margen's own data for a Project (Sessions index, Checkpoints, recents) lives outside the user's folder, in the app's data directory, keyed by the Project's path, so opening a folder doesn't add files to it.
- New projects are created under `~/Documents/Margen/<slug>/`.

**Document view and live reload**
- The Document renders in a sandboxed view with scripts and network allowed and no Node access. Margen injects one preload or script into the rendered copy only, never the file on disk. That script gives Pick, Draw, scroll restore and element geometry access to the page.
- A file change on disk triggers a debounced reload (several writes close together reload once) that restores the scroll position. After reload, the elements the last Turn's Annotations pointed at get a brief glow.
- The Viewport is the view's width: Desktop fits the window, Tablet is 820px and Mobile is 390px.

**Annotations**
- An Annotation is `{ number, kind: "pick" | "draw", comment, viewportWidth, ... }`. A Pick Annotation carries the element's short CSS path, tag, an HTML snippet of up to a few hundred characters, and its text excerpt and line range in the source file when it can be found. A Draw Annotation carries its strokes in page coordinates, a screenshot of the Viewport with the strokes drawn in, a crop of the strokes alone, their bounding box, and the elements the strokes caught, each described the same way as a Pick.
- Draw resolution, from the prototype: for each stroke, collect elements whose box is at least 60% inside the stroke (sampled on a 5×5 grid). Keep only the outermost of those. If more than one remains, use their lowest common ancestor when its area is no more than about 2.2× the stroke's bounding box, otherwise keep up to five separate elements. A drawing's targets are the union over its strokes, reduced to the outermost elements, up to five. The same resolution runs live while drawing, to light up what's caught.
- Arrow-key Pick, from the prototype: ← and → move through all visible elements in document order, ↑ goes to the parent, ↓ goes to the first visible child, ↵ creates the Pick Annotation, and Esc leaves Pick.
- Sending a Turn turns the text and Annotations into one prompt for the Agent. Each Annotation is listed by number with its comment and descriptors, and screenshots are attached as images. The prompt tells the Agent that a drawing may either point at something or show something to add, and that it should judge which from the comment and the strokes.

**Checkpoints**
- Before every Turn, Margen snapshots the Project's files (excluding the ignored folders) into a private store in the app's data directory: a hidden git repository whose work tree is the Project folder. It never reads or writes the user's own `.git`. Reverting restores every file to the snapshot, including deleting files the Turn created. Checkpoints belong to the Project and are listed across all Sessions.

**Sessions**
- One active Session per Document. Sessions are stored by Margen with their Agent session id, so they can be resumed through the AgentProvider. Switching Documents switches the active Session shown in the chat.
- The Project page's chat bar creates a new Document from a description: Margen creates an empty file named from the description and opens it, then starts that Document's Session with the message. If the message `@`-mentions an existing Document, Margen opens it and sends the message to its Session instead.

**UI and design**
- Light mode only, in Margin's design language: grey shell, white rounded main card, Inter, the soft Fraunces "margen" wordmark with Margin's mark, black main buttons, the grainy pastel banner and "Let us build …" title on the Project page, generated covers, and a dark floating toolbar. The accent is blue (`#2f7bff`) for Pick and Draw highlights, strokes, markers and chips. Queued messages use yellow and finished changes green. The clickable prototype in the repo is the visual reference for every screen.

**Distribution**
- A signed and notarized `.dmg` on GitHub Releases, with Electron auto-update from those releases. Nothing Mac-only in the core, so Windows can follow.

## Testing Decisions

- A good test exercises behaviour through a public seam and asserts what a user or the UI would see: the files on disk, the events emitted, the Documents listed. It doesn't assert internal calls, private state or how a module is built. Tests should survive a rewrite of the internals.
- **Seam 1, the host API (most tests):** call the host API directly against a temporary folder on disk, with a **fake AgentProvider** that plays back scripted AgentEvents (text, reads, edits that really write files, approval requests, errors, slow Turns). This covers:
  - Project open and create, and Document discovery, including ignored folders and `.gitignore`
  - the Documents list updating when files appear or vanish
  - starting Turns and the prompt built from text and Annotations
  - Queue ordering, unqueueing, interrupting and the Queue being held after an interrupt
  - the Editor preset deciding allow or ask for each kind of request, and "Allow everything"
  - Checkpoints taken before each Turn, and revert restoring changed, deleted and created files, while the user's own `.git` is untouched
  - one Session per Document, resume, and persistence across restart
  - the Project chat bar creating a Document or targeting an `@`-mentioned one
- **Seam 2, the real app window (a thin layer):** Playwright drives the built Electron app with the same fake AgentProvider and a fixture Project. It covers what needs real layout:
  - Pick by click and by arrow keys
  - Draw resolution: circling the card grid resolves to the grid, empty space resolves to nothing, extra strokes join the open drawing
  - Annotations reaching the Turn with the right descriptors
  - the Composer and Queue in the UI
  - live reload keeping the scroll position after the fake Agent edits the file
  - the Viewport select changing the width recorded on Annotations

  Keep it to a handful of flows.
- **The real Claude adapter:** one opt-in contract test, run against an actual installed and signed-in `claude`. It sends a tiny Turn in a temporary Project and checks the event mapping. It's not part of the default test run.
- **Prior art:** there is no code in the repo yet. The design prototype's Draw resolution and arrow-key Pick behaviour (also scripted in a headless browser during design) are the reference behaviour for the Seam 2 tests. T3 Code's tests for its Claude and Codex adapters are the reference for the adapter contract test.

## Out of Scope

- Codex support (v1.1, behind the same AgentProvider).
- Windows and Linux builds (later; nothing in v1 should rule them out).
- Margen editing the Document directly: no manual text editing, no visual style panel, no code editor. Even a read-only source view is out of v1.
- Framework projects with a dev server or build step (React, Vite and so on). v1 opens HTML files as they are.
- Custom Viewport widths beyond Desktop, Tablet and Mobile.
- Dark mode.
- Telemetry, analytics and crash reporting.
- Payments, accounts or any Margin cloud features.
- Collaboration or sharing Documents from Margen.
- Margen offering its own Claude or ChatGPT login, or handling credentials in any way (ADR 0002).

## Further Notes

- The research behind the Agent integration and its subscription-policy grey zone is in the repo's research notes on desktop agent apps. Lavish and similar tools are covered in the research notes on visual editing.
- Anthropic's terms forbid third-party apps from offering claude.ai login or handling subscription credentials, and allow a user to sign their own unmodified `claude` into their plan. Keep Margen strictly on that side of the line. Review this again before any paid offering.
- Margen is the first open-source part of Margin and lives in its own repo. It shares Margin's design language but no code with Margin.
