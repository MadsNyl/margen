# 16: Settings

**What to build:** A Settings dialog (from the Start and Project screens) shows the Claude Code path, version and signed-in state, Codex as "Coming in 1.1", the permission preset switch (Editor / Allow everything), and About with the version and Check for updates (user stories 92–94).

**Blocked by:** 02, 09

**Status:** ready-for-agent

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [ ] Agent details come from AgentProvider.detect through the host API
- [ ] Changing the preset persists and takes effect on the next request (Seam 1 test)
- [ ] Layout matches the prototype's Settings dialog

- From ticket 17: show the update status from `update.status`/`update.changed` in About, with "Check for updates" (`update.check`) and "Restart to update" (`update.install`) when one is downloaded.
