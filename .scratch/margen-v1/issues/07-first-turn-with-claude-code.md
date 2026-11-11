# 07: First Turn with Claude Code

**What to build:** In the editor, typing in the Composer and sending starts a Turn. The real AgentProvider over the Claude Agent SDK runs the user's own `claude` with the Project as working directory. Thinking, file reads and edits (with lines added/removed) and the reply stream into the chat; when the Agent edits the Document, the view live-reloads (user stories 65, 68; spec: Agent integration). Margen never handles credentials (ADR 0002).

**Blocked by:** 02, 05

**Status:** ready-for-agent

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [ ] The Claude adapter implements AgentProvider and maps SDK messages to AgentEvents (thinking, text, tool read/edit/write with file and +/−, turn-end, error)
- [ ] Sending a Turn through the host API streams AgentEvents to the UI (Seam 1 test with the fake provider writing a file, asserting events and the file on disk)
- [ ] The chat renders user messages, tool cards and streamed replies as in the prototype
- [ ] An Agent edit to the open Document triggers live reload (Seam 2 test with the fake provider)
- [ ] An opt-in contract test (skipped unless an env flag is set) runs a tiny Turn against a real installed `claude`
- [ ] A failed or signed-out `claude` shows a clear error with a way to sign in again


**Research findings to respect** (details in `/Users/madsnylund/.t3/projects/margen-notes/`, see README.md there):
- Always pass the user's own `claude` path to the SDK and exclude the SDK's bundled binary from the app; never fall back to it (ADR 0002).
- Disable loading the user's Claude settings files so their allow rules can't pre-approve tools behind Margen's back.
- Request summarised thinking, or thinking text arrives empty.
- Ignore unknown SDK message types (the user's `claude` may be older or newer than the SDK expects).
- Paths come back resolved (e.g. `/private/tmp/...`); resolve both sides before comparing to the Project.
- From ticket 02: pass `AgentStatus.path` as the SDK executable path; the Claude provider's `startSession` currently throws. User story 7 (expired login) is yours: route "Sign in again" to `agent.signIn` or the Onboarding screen.
- Run `claude` with the user's login-shell PATH/env (npm-installed `claude` needs `node` on PATH; T3 Code captures the login shell env).
