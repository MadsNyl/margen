# 04: New project

**What to build:** "New project" (⌘N) on the Start screen asks for a name, creates an empty folder at `~/Documents/Margen/<slug>/` and opens its Project page, which shows the "Nothing here yet" banner pointing at the chat bar (user stories 11, 24).

**Blocked by:** 03

**Status:** ready-for-agent

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [ ] Creating a Project with a name makes the slugged folder (tested with the base directory overridable in tests)
- [ ] A name that already exists gets a unique slug instead of failing or overwriting
- [ ] The empty Project page shows the "Nothing here yet" state
- [ ] The new Project appears in recent Projects

- From ticket 03: wire ⌘N next to the ⌘O handler in the app root.
