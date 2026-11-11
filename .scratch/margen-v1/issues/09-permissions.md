# 09: Permissions: Editor preset and approvals

**What to build:** The Editor permission preset: reading the Project, writing inside it, and web search/fetch are allowed without asking; shell commands and any path outside the Project raise an approval card in the chat (Allow once / Deny). An "Allow everything" mode approves all. The Composer shows the active preset (user stories 75–80).

**Blocked by:** 07

**Status:** ready-for-agent

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [ ] A permission policy decides allow/ask for each request kind and path, covered by Seam 1 tests (inside/outside Project, `..` escapes, symlinks, shell, web)
- [ ] Approval requests reach the UI as an event and the answer reaches the Agent (fake provider test)
- [ ] Allow once and Deny render as resolved cards afterwards, as in the prototype
- [ ] Allow everything skips all approvals; the preset badge in the Composer reflects the setting


**Research findings to respect** (details in `/Users/madsnylund/.t3/projects/margen-notes/`, see README.md there):
- Claude Code auto-runs read-only shell commands like `ls` without calling the permission callback; add the hook from claude-agent-sdk.md that forces shell commands through Margen.
- In the default mode writes inside the Project still ask, so Margen's callback must allow them itself.
- Resolve real paths on both sides (symlinks, `/private/tmp`) before the inside-Project check.
