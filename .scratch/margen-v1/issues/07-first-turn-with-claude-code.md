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
