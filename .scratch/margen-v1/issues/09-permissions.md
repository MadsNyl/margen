# 09: Permissions: Editor preset and approvals

**What to build:** The Editor permission preset: reading the Project, writing inside it, and web search/fetch are allowed without asking; shell commands and any path outside the Project raise an approval card in the chat (Allow once / Deny). An "Allow everything" mode approves all. The Composer shows the active preset (user stories 75–80).

**Blocked by:** 07

**Status:** done

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [x] A permission policy decides allow/ask for each request kind and path, covered by Seam 1 tests (inside/outside Project, `..` escapes, symlinks, shell, web)
- [x] Approval requests reach the UI as an event and the answer reaches the Agent (fake provider test)
- [x] Allow once and Deny render as resolved cards afterwards, as in the prototype
- [x] Allow everything skips all approvals; the preset badge in the Composer reflects the setting


**Research findings to respect** (details in `/Users/madsnylund/.t3/projects/margen-notes/`, see README.md there):
- Claude Code auto-runs read-only shell commands like `ls` without calling the permission callback; add the hook from claude-agent-sdk.md that forces shell commands through Margen.
- In the default mode writes inside the Project still ask, so Margen's callback must allow them itself.
- Resolve real paths on both sides (symlinks, `/private/tmp`) before the inside-Project check.

## Notes from ticket 09 (for 10, 16 and later)

- **Policy:** `src/main/permissions/index.ts`. `editorPolicy(projectDir)` is the Editor preset; `presetPolicy(projectDir, preset)` asks `preset()` on every request, so a switch applies from the very next tool call, also mid-Turn. `approvalRequest(id, request)` makes the approval-request event, so the Claude adapter and the fake word cards the same way. `ToolRequest` read/write carry the Agent's `tool` name for the card. The approval-request `kind` gained `other` (tools Margen doesn't know, such as MCP ones), worded "use a tool".
- **Claude adapter:** a `PreToolUse` hook on `Bash` answers `ask`, so `ls` and other read-only commands reach `canUseTool` too. Writes inside the Project are allowed by the policy itself (default mode would ask). The contract test now also checks that `ls` raises a shell approval and, denied, doesn't run (green against `claude` 2.1.287, haiku).
- **Host API:** `permissions.preset`, `permissions.setPreset(preset)` (rejects anything that isn't `editor` or `allow-everything`) and the event `permissions.changed`. Switching to Allow everything also allows any approval-request still waiting.
- **Answers are Session entries:** `session.answerApproval` adds `{ type: 'approval-answer', id, decision }` once per request (later answers and unknown ids are ignored), so the resolved cards come back with `session.current` and with ticket 08's persisted Sessions. `transcript.ts` treats a request left unanswered at turn-end as denied, which is what the Agent did with it (interrupt and close deny pending ones).
- **Fake:** a `{ type: 'permission', id, request }` step asks the Session's real policy; only an "ask" emits a card and pauses. Raw scripted `approval-request` steps still work and always show.
- **16 (Settings):** the preset is stored as `{ "preset": … }` in `permissions.json` in the data dir (`src/main/permissions/preset.ts`, `createPresetStore`). If Settings gets one settings file, move it there behind the same `get`/`set` and keep the host calls. The Settings radio calls `permissions.setPreset`; the Composer badge (`PresetBadge` in `ChatPanel.tsx`, labels "Editor" / "Allow all" as in the prototype) already follows `permissions.changed`. Seam 1 coverage for "persists and takes effect on the next request" is already in `test/seam1/permissions.test.ts`; 16 only needs its UI test. The prototype's badge is a button; here it's a plain status, so 16 can make it open Settings. `launchApp({ preset })` seeds the preset for Seam 2.

