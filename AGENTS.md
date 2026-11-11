# Margen

A desktop editor for HTML that runs on the user's own Claude Code. Terms are in `GLOSSARY.md`, decisions in `docs/adr/`, and the agreed v1 scope in `docs/v1-scope.md`. The clickable design prototype is `design/index.html`.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles, each label string equal to its name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
