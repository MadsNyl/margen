# 11: Checkpoints and revert

**What to build:** Before every Turn Margen snapshots the Project into a private store (a hidden git repository in Margen's data directory with the Project as its work tree; never the user's own `.git`). "Revert to here" in the chat restores every file to that Checkpoint, including deleting files the Turn created. The history drawer lists the Project's Checkpoints across all Sessions (user stories 81–85).

**Blocked by:** 07

**Status:** done

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [x] Seam 1 tests: a Turn that edits, creates and deletes files is fully reverted
- [x] A Project that is itself a git repo has its `.git`, branches and status untouched after Checkpoints and reverts (tested)
- [x] Ignored folders are excluded from Checkpoints
- [x] Checkpoint dividers with Revert appear before each Turn in the chat, and the Checkpoints list is shared across Sessions


**Research findings to respect** (details in `/Users/madsnylund/.t3/projects/margen-notes/`, see README.md there):
- Bundle git via `dugite` (MIT) instead of `/usr/bin/git`, which pops an install dialog on Macs without developer tools.

## Notes from ticket 11 (for 10, 16, 17)

- **Where:** `src/main/checkpoints/index.ts` (`openCheckpoints(dataDir, projectDir)`), one store per Project at `<dataDir>/projects/<projectId(realpath)>/checkpoints.git`, with the list in `checkpoints.json` next to it. Host calls `checkpoints.list` / `checkpoints.revert`, event `checkpoints.changed`. Store operations are serialised per store.
- **The Session hook:** `startDocumentSession` takes `beforeTurn(turn)`, awaited inside `send` (now async) before the user entry is added and the Turn reaches the Agent; the host passes one that takes the Checkpoint. The user entry carries `checkpoint: <id>`. A failed snapshot is logged and the Turn goes ahead without one. **10 (Queue):** send queued Turns through the same path so each gets its Checkpoint. `DocumentSession.running()` is new; `checkpoints.revert` refuses while a Turn runs.
- **Sessions:** `src/renderer/src/editor/Checkpoints.tsx` has the divider and `CheckpointList`, which ticket 08's `HistoryDrawer` shows as its Checkpoints tab. A Checkpoint records its Document and Session number. Stored Sessions keep their user entries' `checkpoint` ids, so dividers come back on resume. `documentSessions` passes `beforeTurn` through to each Session.
- **Revert** takes a `revert` Checkpoint first, so it's undoable, then `read-tree -u --reset` + `clean -fdq`. No confirm dialog (the prototype has none); it also deletes files the user added outside Margen since that Checkpoint, but they're in the `revert` Checkpoint. Nested git repos are stored as gitlinks and left alone.
- **No size guard** yet (notes suggest warning over ~200 MB) and no `gc`; git's own `gc --auto` runs on commit.
- **17 (Releases):** dugite's git (about 150 MB unpacked, the dmg grew to ~160 MB) is `asarUnpack`ed. dugite only downloads the host arch on install, so `build/dugite-git.mjs` (`beforePack`) fetches the arch being packed and `afterAllArtifactBuild` puts the host's back; checked with an x64 `--mac dir` build on arm64. electron-builder signs the unpacked binaries; not yet verified with notarization. `pnpm-workspace.yaml` allows dugite's postinstall.
