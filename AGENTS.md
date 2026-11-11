# Margen

A desktop editor for HTML that runs on the user's own Claude Code. Terms are in `GLOSSARY.md`, decisions in `docs/adr/`, and the agreed v1 scope in `docs/v1-scope.md`. The clickable design prototype is `design/index.html`.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles, each label string equal to its name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Code

Stack: pnpm, TypeScript (strict), electron-vite, React 19, Tailwind CSS v4, Vitest (Seam 1), Playwright `_electron` (Seam 2). Fonts are bundled from `@fontsource-variable/*`, never a CDN. Light mode only; the design tokens from `design/index.html` live in `src/renderer/src/styles.css` (`@theme`).

Before calling a change done, run `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm e2e`.

### Where things go

- **The host API** is the only bridge between renderer and main. To add a call or event: add it to `HostCalls` / `HostEvents` in `src/shared/host-api.ts`, implement it in `createHost` (`src/main/host/index.ts`), and for events add the name to `FORWARDED_EVENTS` in `src/main/index.ts`. The preload and `src/main/ipc.ts` need no changes. The renderer uses `host` and `useHostValue` from `src/renderer/src/host.ts`.
- **Domain logic** lives in framework-free modules under `src/main/<area>/`, composed by `createHost`. No `electron` imports there; take paths and providers as arguments. `src/main/index.ts`, `src/main/ipc.ts` and `src/main/auto-update.ts` (the electron-updater adapter) are the only Electron-aware main files.
  - `projects/`: Projects, recents, Document discovery and watching (tickets 03, 04, 15); the open Document's margen-doc:// URL, what it may serve and its debounced reload watch (`document.ts`, 05)
  - `agent/`: the AgentProvider interface (`provider.ts`), the fake (`fake.ts`), provider choice (`index.ts`); the Claude Code adapter in `agent/claude/` (02, 07): `session.ts` runs the Agent SDK's `query()`, `messages.ts` maps its messages to AgentEvents. Everything it runs on the Mac (`claude`, the login shell and its env, the installer, Terminal, the SDK's `query`) goes through `ClaudeSystem` (`claude/system.ts`) so tests pass a pretend one; `claude/node-system.ts` is the real one
  - `turns/`: building prompts from text and Annotations; the Queue and holding it after an interrupt (`queue.ts`, 10); the model and effort chosen last, kept app-wide in the data dir (`model.ts`)
  - `permissions/`: the one `PermissionPolicy` every tool call goes through (07); the Editor preset and Allow everything, `presetPolicy`, and the chosen preset in the data dir (`preset.ts`, 09)
  - `sessions/`: the open Document's Session and its entries (07); one Session per Document, resume, persistence (08): `store.ts` in the data dir, `document.ts` switches a Document's Sessions
  - `checkpoints/`: the hidden git store outside the user's folder (11), run with dugite's bundled git (never `/usr/bin/git`); the host takes one in `beforeTurn` of the Document's Session
  - `updates/`: auto-update state behind an `UpdateSource` (17); `createHost({ updates })` takes the source, absent in dev and tests
- **Shared data types** (AgentEvent, TurnInput, Annotation, anything sent over the host API) go in `src/shared/`.
- **The renderer**: one file per screen in `src/renderer/src/screens/`, shared pieces in `components/`. The editor (05+) has its own `src/renderer/src/editor/` folder: `DocumentView.tsx` (the `<webview>`), `bridge.ts`, `ChatPanel.tsx` (the chat and Composer), `Queue.tsx` (the Queue panel above the Composer), `ModelPicker.tsx` (model and effort), `PickLayer.tsx` (highlight, markers, comment box), `DrawLayer.tsx` (strokes, live highlight, a drawing's screenshots) and `transcript.ts` (folds Session entries into chat items). Draw resolution is the pure `src/shared/draw.ts`, run by the page script and unit-tested in `test/unit/draw.test.ts`. The Settings dialog is `components/Settings.tsx`; `useOpenSettings()` opens it from any screen. The script inside the rendered Document (Pick, Draw, scroll restore) is the `document` preload entry, `src/preload/document.ts`, kept apart from the app preload. It and the editor talk only through the Document bridge (`src/shared/document-bridge.ts`): add a message type there, validate it in `parseFromDocument`. Seam 2 reaches inside the Document view through the main process (`inDocument` in `e2e/editor.spec.ts`), since Playwright doesn't attach to webviews.
- **Releases**: `electron-builder.yml` packages, `.github/workflows/release.yml` signs, notarizes and publishes on a `v*` tag. `pnpm dist:local` makes an unsigned dmg. dugite's git ships unpacked from the asar; `build/dugite-git.mjs` fetches it for each arch being packed. Keep Mac-only code out of the core so Windows can follow.
- **Margen's own data** goes in the data directory passed to `createHost` (Electron's `userData`, or `MARGEN_DATA_DIR`), never in the user's Project folder.

### Tests

- Seam 1 (`test/seam1/*.test.ts`): `createHost({ dataDir, agent })` with a temp folder and `createFakeAgentProvider(script)`. Assert host API results, emitted events and files on disk.
- The Claude Code adapter (`test/seam1/claude-*.test.ts`): `createClaudeCodeProvider(system)` with a pretend `ClaudeSystem`; for Turns its `query` yields scripted SDK messages shaped like the real `claude`'s.
- The contract test (`test/contract/`) runs one Turn against the real `claude`, only with `MARGEN_CLAUDE_CONTRACT=1`.
- Seam 2 (`e2e/*.spec.ts`): `launchApp({ recents, agent })` from `e2e/app.ts` launches the built app with a fresh data directory and a fake Agent script. Keep it to a handful of flows that need real layout.
- The fake Agent script (`FakeAgentScript` in `src/main/agent/fake.ts`) scripts `detect`, the outcome of `install` and `signIn`, and one list of steps per Turn: any AgentEvent, `tool` steps with `content` that really write the file or `removes` that really delete files, `permission` steps that ask the Session's real policy (only an "ask" shows a card), and `wait` for slow Turns. Approval requests pause until answered; interrupt ends the Turn.
