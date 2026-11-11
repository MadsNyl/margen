# Desktop apps that drive Claude Code / Codex locally

Researched 2026-11-10/11. Code facts come from shallow clones of each repo's default branch on that date. Paths are relative to each repo. **[uncertain]** marks claims I could not confirm from a primary source.

---

## 1. T3 Code (pingdotgg/t3code)

| Aspect | Finding | Source |
|---|---|---|
| License | **MIT**, "Copyright (c) 2026 T3 Tools Inc." You can fork it or copy code; keep the notice. | [LICENSE](https://github.com/pingdotgg/t3code/blob/main/LICENSE) |
| Contributions | "(mostly) not accepting contributions"; README says it is built so users can fork it | [README](https://github.com/pingdotgg/t3code#some-notes) |
| Shell | **Electron 44.10.1**, electron-builder, electron-updater | `apps/desktop/package.json` |
| UI | **React 19.3**, TanStack Router, Tailwind 4, Vite+ | `apps/web/package.json`, `pnpm-workspace.yaml` |
| Backend | Node server (`t3` npm bin) written with **Effect 4**. The desktop app bundles this server. Web, desktop and mobile clients talk to it over authenticated RPC. | [docs/internals/overview.md](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md) |
| Platforms | macOS (brew cask, DMG), Windows (winget, scoop), Linux (deb, AUR, Nix), plus iOS and Android remote apps | [README](https://github.com/pingdotgg/t3code#installation) |
| Nightly | Built about every 30 minutes from `main` (e.g. `v0.1.9-nightly.20261110.4491`). Stable releases promote a verified nightly commit. CLI: `T3CODE_CHANNEL=nightly`. AUR: `t3code-nightly-bin`. | [release.md](https://github.com/pingdotgg/t3code/blob/main/docs/operations/release.md), [install.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/install.md), [Releases](https://github.com/pingdotgg/t3code/releases) |
| Providers | Claude, Codex, Cursor, Grok Build, OpenCode, Antigravity, fx, Pi, Kiro and others via ACP. Each provider sits behind an adapter. | README, `packages/provider-*` |

### How T3 Code drives Claude Code
- It uses the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk ^0.3.321`) and calls `query()` in **streaming-input mode**. The prompt is an `AsyncIterable` fed from an unbounded `Queue<SDKUserMessage>`, so one CLI process stays alive for the whole thread. (`apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts`, around lines 1180-1300)
- **It spawns the user's own `claude` binary.** It passes `pathToClaudeCodeExecutable` (the binary path setting, default `claude`) and a custom `spawnClaudeCodeProcess` that runs the CLI in a process group.
- **Auth:** it reuses `claude auth login` credentials. To use more than one account, the user sets a separate `CLAUDE_CONFIG_DIR` per provider instance. T3 never handles Claude tokens itself. ([providers-claude.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/providers-claude.md))
- **Sessions:**
  - Resume: `resume: <sessionId>` plus `resumeSessionAt` for rollback.
  - Fork: `forkSession`, run in a worker so each `CLAUDE_CONFIG_DIR` stays isolated.
  - Partial messages: `includePartialMessages: true` for streaming text.
- **Interrupt, steer, queue:**
  - Stop calls `queryRuntime.interrupt()`. If the CLI has not exited after 10 s, the user is offered "Force stop".
  - The adapter declares `supportsInterrupt`, `supportsActiveSteering` and `supportsQueuedMessages`. A steer pushes a new user message into the live prompt queue.
- **Permissions:**
  - T3's modes (Supervised, Auto-accept edits, Auto, Full access) map to the SDK's `permissionMode` values (`default`, `acceptEdits`, `auto`, `bypassPermissions` with `allowDangerouslySkipPermissions`, `plan`).
  - Approvals go through the SDK `canUseTool` callback and render inline. Typing text while an approval is pending denies it and sends that text to the agent as feedback. ([permission-modes.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/permission-modes.md))
- **Images:** png, jpeg, gif and webp are sent as base64 `image` content blocks. PDFs go as base64 `document` blocks. Uploads are stored outside the workspace. (`ClaudeAdapterV2.ts` around line 2590; [providers.md](https://github.com/pingdotgg/t3code/blob/main/docs/internals/providers.md#attachments-and-stored-history))
- **MCP:** T3 injects its own MCP server per thread with `query.setMcpServers()`, sending credentials over stdin rather than argv.

### How T3 Code drives Codex
- It spawns **`codex app-server`** (JSON-RPC over stdio). (`apps/server/src/provider/codexLaunchArgs.ts`)
- Its typed client, `packages/effect-codex-app-server`, is **generated from the JSON schemas in `openai/codex` `codex-rs/app-server-protocol`**. (`scripts/generate.ts`)
- **Methods it uses:**
  - Threads: `thread/start`, `thread/resume`, `thread/fork`, `thread/read`, `thread/revert`, `thread/compact/start`, `thread/goal/*`
  - Turns: `turn/start`, `turn/steer`, `turn/interrupt`
  - Notifications: `item/started|completed`, `turn/started|completed`
- **Approvals:** handled as server requests: `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval`. Async questions (`item/tool/requestUserInput`) are answered by sending a new user message.
- **Images:** sent as `{type:"image", url:"data:<mime>;base64,..."}`.
- **Auth, two options:**
  - (a) Reuse the existing `codex login` (`~/.codex`, or `CODEX_HOME` plus a "shadow home" per account).
  - (b) A managed "**Connect with ChatGPT**" flow built on OpenAI's *Sign in with ChatGPT* plan-usage program. (`CodexChatGptAuth.ts` references `ext_agent_host_id`; [providers-codex.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/providers-codex.md))

### Directly relevant to our app: preview, element picker and annotations
- The T3 desktop app already ships an embedded browser (an Electron `<webview>`, `apps/web/src/browser/HostedBrowserWebview.tsx`) with an **element picker and annotation overlay**:
  - The overlay is the preload script `apps/desktop/src/preview/PickPreload.ts`.
  - It uses **`react-grab/primitives` `getElementContext`** to capture selector, source stack frame, and similar context.
  - The result is a `PickedElementPayload` that becomes a composer chip ("picked element", "preview annotation"). ([composer.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/composer.md))
- It also renders agent-authored HTML "visual replies" in a sandbox and checks them with a private headless browser. ([html-renders.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/html-renders.md))

---

## 2. Other desktop apps

| App | Stack | License | Agents | Integration | Notable UX |
|---|---|---|---|---|---|
| **Codex app** (OpenAI) | Electron + Node ([Simon Willison](https://simonwillison.net/2026/Feb/2/introducing-the-codex-app/)) | Proprietary (the `openai/codex` CLI is Apache-2.0) | Codex | App-server is OpenAI's standard harness protocol, built first for the VS Code extension ([OpenAI blog](https://openai.com/index/unlocking-the-codex-harness)). **[uncertain]** that the desktop app uses it; I could not fetch the blog. | macOS since Feb 2026, Windows since Mar 2026 ([TechRepublic](https://www.techrepublic.com/article/news-openai-codex-windows-app-launch/)). Threads per project, skills, automations. |
| **Claude desktop, Code tab** (Anthropic) | Electron **[uncertain]** | Proprietary | Claude Code | First party, uses the subscription | Browser pane with **element selection (Cmd+Shift+S)**, `autoVerify` screenshots, `.claude/launch.json` dev servers, diff with line comments, worktrees, SSH/WSL/cloud sessions, permission modes ([docs](https://code.claude.com/docs/en/desktop)) |
| **Conductor** | Mac app; stack not documented **[uncertain]** | Closed source, free for now | Claude Code, Codex, Cursor, OpenCode | Uses the tokens already on the machine: Claude Pro/Max or API key; Codex from `~/.codex` ([FAQ](https://www.conductor.build/docs/faq)) | One workspace per task (branch, terminal, diff, review); parallel agents ([docs](https://www.conductor.build/docs/)). Listed as a Sign in with ChatGPT partner ([The New Stack](https://thenewstack.io/sign-in-with-chatgpt/)). |
| **Nimbalyst** (formerly **Crystal**) | Electron 43, React 19 | **MIT** ([repo](https://github.com/nimbalyst/nimbalyst), [Crystal](https://github.com/stravu/crystal)) | Claude, Codex, OpenCode, Copilot, Grok, Cursor | Claude: Agent SDK. Codex: **app-server over stdio** (`@openai/codex-sdk` kept as a fallback) plus experimental ACP. Others: ACP or `stream-json`. ([AI_PROVIDER_TYPES.md](https://github.com/nimbalyst/nimbalyst/blob/main/docs/AI_PROVIDER_TYPES.md)) | Visual markdown, mockup and diagram editing; parallel worktrees; mobile companion app. Code comments describe its Agent SDK path as API-key billed and are building a separate "`claude` CLI in a terminal" path for subscriptions (`ClaudeCodeCliProvider.ts`). |
| **Craft Agents** | Electron + Bun, React | **Apache-2.0** ([repo](https://github.com/craft-ai-agents/craft-agents-oss)) | Claude via Agent SDK, plus the Pi SDK (Codex OAuth, Copilot, Gemini) | Agent SDK; sets `CLAUDE_CODE_OAUTH_TOKEN` from its own OAuth flow (`packages/shared/src/config/llm-connections.ts`) | Document-centric workflow, easy API/MCP connections, headless server with a thin client. Its own Claude Max OAuth flow **appears to conflict** with Anthropic's rule against intermediating credentials (see §3). **[uncertain]** whether Craft has approval. |
| **opcode** (formerly Claudia) | **Tauri 2** + React 18, Rust backend | **AGPL-3.0** (copyleft) ([repo](https://github.com/winfunc/opcode)) | Claude Code only | Spawns `claude -p ... --output-format stream-json` from Rust (`src-tauri/src/web_server.rs`) | Session timeline and checkpoints, custom agents, usage dashboard, MCP manager. Mac, Windows (WebView2), Linux. |
| **Vibe Kanban** | Rust (axum) + React, Tauri app crate | Apache-2.0 | Claude, Codex, Gemini, Amp, Cursor, OpenCode, and more | Claude: `claude --output-format=stream-json --input-format=stream-json --include-partial-messages` with a control protocol (`control_request`/`can_use_tool`). Codex: `app-server`. (`crates/executors/src/executors/`) | Kanban to workspaces; a preview proxy that injects **click-to-component (bippy)** and eruda devtools (`crates/preview-proxy`). **Being shut down** ([README](https://github.com/BloopAI/vibe-kanban)). |
| **Sculptor** (Imbue) | Electron 45, React 19, Python backend | MIT, but no external contributions yet ([repo](https://github.com/imbue-ai/sculptor)) | Claude Code, Pi, any terminal agent | Claude as a "streaming JSON process with its control protocol enabled". Replaces AskUserQuestion and ExitPlanMode with its own tools. ([integrated_harnesses.md](https://github.com/imbue-ai/sculptor/blob/main/docs/help/integrated_harnesses.md)) | Editable message queue, pending questions that survive restarts, turns that survive an app crash. Mac and Linux. |
| CloudCLI / claudecodeui | Web UI (Node) | AGPL-3.0 | Claude, Codex, Cursor, OpenCode | CLI wrappers | Mobile and remote web UI ([repo](https://github.com/siteboon/claudecodeui)) |
| Claude Squad | Go TUI (tmux) | AGPL-3.0 | Claude, Codex, Amp, and more | Runs the interactive TUIs in tmux | Terminal only ([repo](https://github.com/smtg-ai/claude-squad)) |

---

## 3. Policy

### Anthropic (Claude Pro/Max)
- **What the docs say:**
  - "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users … developers may not collect, store, or intermediate Claude.ai credentials or session tokens — sign-in to a Claude account must complete through Anthropic's own flow." ([Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use))
  - The same page also says it does **not** "prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription". (same page)
  - Agent SDK overview: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK." ([Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview))
- **Timeline:**
  - Jan 9, 2026: enforcement against third-party clients using Max OAuth started.
  - Feb 19, 2026: Anthropic updated its docs to clarify the ban ([The Register](https://www.theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/5014546), [WinBuzzer](https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/); secondary sources).
- **Billing:**
  - Anthropic announced in May 2026 that Agent SDK, `claude -p` and third-party app usage would move to separate credits. That change was **paused on June 15, 2026**, so they still draw from subscription limits ([support article](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)).
  - Since Oct 7, 2026, Max ($100/mo), Ultra ($200/mo) and Team plans include **API credits** usable for the Agent SDK with an API key from a linked Console org. These credits do not cover Claude Code itself ([API credits doc](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers)).
- **Branding:** you can't call your product or menu item "Claude Code"; "Claude Agent" is allowed ([Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview#branding-guidelines)).
- **What this means for T3 Code's model [uncertain, not legal advice]:**
  - The model is: the user runs `claude auth login` themselves, and the app spawns the user's own unmodified `claude` binary through the SDK.
  - That sits closest to the explicit carve-out for "signing in to the unmodified Claude Code binary". The app never sees the token.
  - Conductor, T3 Code and Nimbalyst all ship this way openly.
  - It is still a grey zone. Building your own OAuth flow (the Craft pattern) is clearly prohibited without approval.
  - Safest options: (a) run Claude via the user's own `claude` login, or offer an API key; (b) never touch tokens; (c) ask Anthropic sales for approval if the product is commercial.

### OpenAI (Codex with ChatGPT plans)
- **Codex app-server** is OpenAI's documented way to "embed Codex into your product". It supports the user's ChatGPT login, `thread/*` and `turn/*` methods, approvals, and `image`/`localImage` inputs ([app-server docs](https://learn.chatgpt.com/docs/app-server)).
- **Sign in with ChatGPT, plan usage:**
  - Users sign in through OpenAI, opt in to sharing their plan, and set a per-app usage cap. The app then calls the Responses API, or configures `codex app-server` with the OAuth token.
  - It is open to **open-source and locally hosted apps**. Paid or remotely hosted apps must fill in an interest form ([SIWC token sharing](https://developers.openai.com/siwc/token-sharing-open-source), [SIWC overview](https://developers.openai.com/siwc)).
  - DevDay 2026 partners include Conductor, OpenCode, Pi, Warp and T3 ([The New Stack](https://thenewstack.io/sign-in-with-chatgpt/); secondary).
- **Reusing an existing `codex login` through app-server** is how T3, Nimbalyst, Vibe Kanban and Conductor work. **[uncertain]** I found no explicit OpenAI statement about third-party apps reusing `~/.codex` credentials. For a closed-source commercial app, SIWC (via the interest form) is the sanctioned route.

---

## 4. Recommendation (Mac-first, Windows later; HTML preview, element picker and chat)

**Shell: Electron.**
- The Agent SDK is Node/TS, and so is the T3 Codex app-server client, so both can run in Electron's main or utility process with no sidecar.
- Chromium renders the same on Mac and Windows. Tauri uses WKWebView on macOS and WebView2/Chromium on Windows, so the preview would render differently per OS ([Tauri webview versions](https://v2.tauri.app/reference/webview-versions/)).
- Electron's `<webview>` / `WebContentsView` with an isolated preload makes picker injection, CDP screenshots and console capture straightforward. T3 Code does exactly this.
- Every serious app in this space (T3, Codex app, Nimbalyst, Craft, Sculptor) uses Electron. Tauri's only real advantage is bundle size.

**Integration path:**
1. **Claude:** use `@anthropic-ai/claude-agent-sdk` `query()` with a streaming-input queue.
   - Set `pathToClaudeCodeExecutable` to the user's installed `claude`, so it uses their own `claude auth login`. Do not implement your own OAuth.
   - Use `canUseTool` for approvals, `interrupt()` to stop, `resume`/`forkSession` for sessions, base64 image blocks for picker screenshots, and `includePartialMessages` for streaming.
   - Offer API-key mode too (it works with the Max/Team API credits).
2. **Codex:** spawn `codex app-server` over stdio.
   - Generate types from `codex-rs/app-server-protocol` (or reuse T3's MIT `effect-codex-app-server`).
   - Use `turn/start` with `localImage` or data-URL images, `turn/steer`, `turn/interrupt`, and the `*/requestApproval` handlers.
3. **Picker:** a preload script in the preview webview that uses **react-grab** (selector plus React source frame) or bippy, as in T3's `PickPreload.ts` and Vibe Kanban's `click_to_component_script.js`. Send the payload and a screenshot as context chips.

**Best project to learn from or fork:**
- **T3 Code**, because it is:
  - MIT licensed
  - Electron + React
  - Mac and Windows
  - already an Agent SDK + app-server implementation with a preview picker and annotations
- It is very large (about 32k files; the Claude adapter alone is 12k lines) and built on Effect, so **borrow modules** rather than fork the whole thing:
  - `ClaudeAdapterV2.ts`: query runner, permissions, attachments
  - `packages/effect-codex-app-server`
  - `apps/desktop/src/preview/{PickPreload,Manager}.ts`
- **Nimbalyst** (MIT) is a simpler second reference for Claude SDK + Codex app-server in Electron.
- Avoid copying from **opcode**, **CloudCLI** and **Claude Squad**: they are AGPL.
