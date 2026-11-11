# 11: Checkpoints and revert

**What to build:** Before every Turn Margen snapshots the Project into a private store (a hidden git repository in Margen's data directory with the Project as its work tree; never the user's own `.git`). "Revert to here" in the chat restores every file to that Checkpoint, including deleting files the Turn created. The history drawer lists the Project's Checkpoints across all Sessions (user stories 81–85).

**Blocked by:** 07

**Status:** ready-for-agent

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [ ] Seam 1 tests: a Turn that edits, creates and deletes files is fully reverted
- [ ] A Project that is itself a git repo has its `.git`, branches and status untouched after Checkpoints and reverts (tested)
- [ ] Ignored folders are excluded from Checkpoints
- [ ] Checkpoint dividers with Revert appear before each Turn in the chat, and the Checkpoints list is shared across Sessions


**Research findings to respect** (details in `/Users/madsnylund/.t3/projects/margen-notes/`, see README.md there):
- Bundle git via `dugite` (MIT) instead of `/usr/bin/git`, which pops an install dialog on Macs without developer tools.
