# 07: First Turn with Claude Code

**What to build:** In the editor, typing in the Composer and sending starts a Turn. The real AgentProvider over the Claude Agent SDK runs the user's own `claude` with the Project as working directory. Thinking, file reads and edits (with lines added/removed) and the reply stream into the chat; when the Agent edits the Document, the view live-reloads (user stories 65, 68; spec: Agent integration). Margen never handles credentials (ADR 0002).

**Blocked by:** 02, 05

**Status:** done

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [x] The Claude adapter implements AgentProvider and maps SDK messages to AgentEvents (thinking, text, tool read/edit/write with file and +/−, turn-end, error)
- [x] Sending a Turn through the host API streams AgentEvents to the UI (Seam 1 test with the fake provider writing a file, asserting events and the file on disk)
- [x] The chat renders user messages, tool cards and streamed replies as in the prototype
- [x] An Agent edit to the open Document triggers live reload (Seam 2 test with the fake provider)
- [x] An opt-in contract test (skipped unless an env flag is set) runs a tiny Turn against a real installed `claude`
- [x] A failed or signed-out `claude` shows a clear error with a way to sign in again


**Research findings to respect** (details in `/Users/madsnylund/.t3/projects/margen-notes/`, see README.md there):
- Always pass the user's own `claude` path to the SDK and exclude the SDK's bundled binary from the app; never fall back to it (ADR 0002).
- Disable loading the user's Claude settings files so their allow rules can't pre-approve tools behind Margen's back.
- Request summarised thinking, or thinking text arrives empty.
- Ignore unknown SDK message types (the user's `claude` may be older or newer than the SDK expects).
- Paths come back resolved (e.g. `/private/tmp/...`); resolve both sides before comparing to the Project.
- From ticket 02: pass `AgentStatus.path` as the SDK executable path; the Claude provider's `startSession` currently throws. User story 7 (expired login) is yours: route "Sign in again" to `agent.signIn` or the Onboarding screen.
- Run `claude` with the user's login-shell PATH/env (npm-installed `claude` needs `node` on PATH; T3 Code captures the login shell env).

## Notes from ticket 07 (for 08–14)

- **Events:** `AgentEvent` (`src/shared/agent.ts`) grew a little. `text` and `thinking` are pieces (deltas) that the chat joins up. A `tool` event has an `id` and a `status` (`running`, then `done` or `failed`); file tools carry `file` (relative to the Project, or absolute outside it) and `added`/`removed` when done, other tools (`shell`, `search`, `web`, `other`) carry the tool's `name` and a `detail`. Every Turn ends with exactly one `turn-end`, reason `done`, `interrupted` or `failed` (after an `error`). `error.reason` is `signed-out` or `not-installed` when that's the fix.
- **Host API:** `session.current` → `SessionView { document, entries }` (`null` with no Document open), `session.send(TurnInput)` (rejects while a Turn runs or with no Document), `session.answerApproval(id, decision)`, and the event `session.entry { document, index, entry }`. `SessionEntry` is `{ type: 'user', turn }` or any AgentEvent. The chat (`editor/ChatPanel.tsx`) loads `session.current` and appends entries whose `index` is next; `editor/transcript.ts` folds entries into chat items.
- **08 (Sessions):** `src/main/sessions/index.ts` `startDocumentSession` is the in-memory Session for the open Document; the host makes one in `openDocument` and disposes it in `closeDocument`, so switching Documents already starts an empty Session. It takes `resumeId` and exposes `agentSessionId()` for persistence. Persist `{ agentSessionId, entries }` per Project and Document under the data dir, and pass `resumeId` back. The Claude adapter picks its session id up front (`sessionId: randomUUID()`), so `AgentSession.id` is right from the start, and with `resumeId` it passes `resume` (and since `pathToClaudeCodeExecutable` is always set, the SDK doesn't stage credentials itself; check again when you build resume). If `claude` crashes, the next Turn restarts it with `resume`. `AgentSession.close()` is new; call it when a Session is put away.
- **09 (Permissions):** every Claude tool call goes through `canUseTool` → `ToolRequest` (`src/main/permissions/index.ts`: `read`/`write` with a path, `web`, `shell`, `other`) → the `PermissionPolicy` passed in `StartSessionOptions.permissions` (the host passes `projectPolicy(projectDir)`). `ask` becomes an `approval-request` (`id` is the SDK's `toolUseID`), held until `answerApproval` or the SDK's abort signal; interrupt and close deny pending ones. Still missing: the `PreToolUse` Bash hook (Claude auto-runs `ls` and other read-only commands without asking), Allow everything, the preset in the Composer, and the prototype's resolved cards; `ChatPanel`'s `Approval` is a plain stand-in with Allow once / Deny. `inProject` (`src/main/projects/inside.ts`) resolves symlinks on both sides, through the nearest existing folder for new files. `other` tools (e.g. MCP) ask with kind `outside-project`; you may want a third kind. Verified with the real `claude`: an Edit inside the Project went through `canUseTool` and was allowed by the policy.
- **10 (Queue, interrupt, model):** `AgentSession.interrupt()` works in the Claude adapter (calls `query.interrupt()`; the `result` that follows maps to turn-end `interrupted`), but has no host call or UI yet. `startDocumentSession` refuses a second `send` while running (the host rejects `session.send`); the Queue replaces that. The Send button is disabled during a Turn; it becomes Queue. `model` and `effort` already reach the SDK from `StartSessionOptions`; the Composer shows a "Default model" placeholder. Changing the model mid-Session needs `query.setModel()` or a new Session (the glossary says the Agent can't change partway, the model can).
- **11 (Checkpoints):** snapshot before `session.send` reaches the agent, in `startDocumentSession.send` or the host handler.
- **12 (Pick):** the Claude adapter sends only `turn.text` (a comment marks the spot in `claude/session.ts`); build the prompt from Annotations in `src/main/turns/` and send content blocks (text + images) there. The CLI may `Read` an attached image from its temp folder; filter that out of the tool cards. The Composer (`ChatPanel.tsx`) keeps its draft in local state; chips and the quick comment box need it lifted up so both share one draft.
- **Packaging:** the SDK is a dependency (ESM only; Electron 45 `require`s it fine). Its runtime imports only Node built-ins; the bundled `claude` binaries stay out via `electron-builder.yml`.
- **Contract test:** `MARGEN_CLAUDE_CONTRACT=1 pnpm vitest run test/contract` ran green against `claude` 2.1.287 with haiku (about 7 s): thinking deltas, Read, Edit `+1 −1`, reply text, turn-end `done`, file changed.
- **Flaky:** `test/seam1/projects.test.ts` "pushes the new Documents list…" timed out once with the full suite running in parallel and passes alone. It's from before this ticket (fs watching under load).
