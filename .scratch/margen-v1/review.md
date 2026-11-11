# Code review of margen-v1 (since main)

Two-axis review run on 2026-11-12 after all 17 tickets merged. Checks on the integration branch: typecheck, lint, 144 tests (3 opt-in skipped), 35 e2e, all passing.

## Fix list (for the single fix pass)

All 14 fixed on branch `review-fixes`; each item notes its commit.

### Security
1. **margen-doc:// follows symlinks out of the Project.** `resolveDocumentUrl` checks containment with path strings only, so a symlink inside the Project pointing outside (e.g. `~/.ssh/id_rsa`) is served to the Document view. Reuse the real-path containment the permission policy uses (`projects/inside.ts`). Add a Seam 1 test. (US 29)
   - **Fixed (48e534f): `resolveDocumentUrl` also checks `inProject` on the real path; Seam 1 test with a symlinked file and folder.**
2. **The app window opens any URL scheme externally.** `setWindowOpenHandler` on the main window calls `shell.openExternal` without the `https?:` guard the Document view has. Add the same guard.
   - **Fixed (48e534f, c1ba909): the app window hands only http(s) to `shell.openExternal`; Seam 2 test.**

### Spec
3. **Revert misses gitignored files.** Checkpoints honour the Project's `.gitignore`, so a Turn that edits or creates a gitignored file can't be undone. Per the spec ("excluding the ignored folders"), snapshot everything except Margen's fixed ignored folders (`node_modules`, `.git`, build folders), regardless of `.gitignore`; skip single files over ~50 MB and say so in the log. Add a Seam 1 test. (US 85)
   - **Fixed (90f20c4): Margen lists the files itself and adds them with `-f`, so `.gitignore` doesn't apply; files over 50 MB are left out (and kept by a revert) with a console warning. A revert is `read-tree` alone now (`git clean` also deleted folders holding only a `.git`), and a new nested repo with no commits no longer breaks the Checkpoint.**
4. **Pick thumbnails are text.** Capture a screenshot of the picked element's box (reuse `document.capture`) as its chat thumbnail and attach it to the Turn as an image, as Draw does. Keep it tolerant of capture failing. (US 66; problem statement mentions screenshots)
   - **Fixed (4e104e6): a Pick crops its element's box from `document.capture` (shared in `editor/capture.ts`); it's the thumbnail and goes along as an image. No crop if the capture fails.**

### Follow-ups now in scope (`follow-ups.md`)
5. **Switching Documents or Sessions during a Turn** closes the Agent silently. Ask first ("A Turn is running. Stop it and switch?"), and stop the Turn only on confirm.
   - **Fixed (b709c03): asks for another Document, New session, resume, back to the Project or Start, and links in the Document to another Document (now a `document.link` event, so the editor asks). New `session.running` host call.**
6. **Esc in Pick/Draw with no comment box open** both leaves the Mode and stops a running Turn. Esc should leave the Mode only; Esc stops the Turn only when no Mode/box/menu used it (prototype). Also make Esc pressed while the Document has focus reach the stop logic.
   - **Fixed (9e6f519): leaving a Mode takes the Esc; an unused Esc from the Document is passed on to the editor window, where it stops the Turn.**
7. **Annotation numbers restart per Document view.** Number Annotations per Session, continuing after the highest number already in it.
   - **Fixed (55443d4): numbered after the highest the Session has used (sent, queued, just sent); a new Session starts at 1.**
8. **Sign in can't be cancelled.** Add a Cancel on the Sign in step while it's waiting.
   - **Fixed (cab5b3c): Cancel on the Sign in step (and the chat's Sign in again) while waiting; `agent.cancelSignIn` / `AgentProvider.cancelSignIn`.**
9. **Model and effort reset per Document.** Remember the last choice (app-wide) in Margen's data directory.
   - **Fixed (5b24445): `model.json` in the data directory via `model.choice` / `model.setChoice` / `model.changed` (`turns/model.ts`).**
10. **Only the root `.gitignore` is read** when finding Documents. Honour nested `.gitignore` files too.
   - **Fixed (08aa1d3): each folder's `.gitignore` applies to it, the deepest winning as in git.**
11. **Flaky live-reload test** (about 1 in 15): "a change to the page's stylesheet or images reloads it too, another Document does not" sometimes sees an extra update. Make `watchDocument` deterministic and the test reliable; run it 20 times to prove it.
   - **Fixed (22681fd): the test failed every time run on its own; the cause was macOS reporting files written just before the watch began and the Project folder itself. `watchDocument` counts an event only when the file's size or mtime really changed. 20 runs alone and 20 with its file, no failures.**

### Standards
12. **Glossary _Avoid_ words in UI copy.** `Toolbar.tsx`: "scribble" and "sketch" in the Draw tip/hint, "page" in the Browse tip. Reword with glossary terms (Document, drawing). The prompt's "sketch" is fine.
   - **Fixed (d20c8c7).**
13. **Duplicated code (judgement).** The repeated `{ timeoutMs: 10_000 }` and login-shell calls in the Claude agent code → one named constant and one `runInLoginShell` helper. The repeated "No Project/Document is open" guards in `host/index.ts` → `requireProject()` / `requireSessions()` helpers.
   - **Fixed (90afb2a for the Claude part: `QUICK_RUN_MS`, `runInLoginShell`; f7ea8ec for the host: `requireProject()` / `requireDocument()`, the latter since the host now holds one open Document rather than separate Sessions).**
14. **`createHost` does too much (judgement).** Move the open-Document lifecycle (open/close, Session wiring, the Checkpoint `beforeTurn`) out of the composition root into its own module.
   - **Fixed (f7ea8ec): `host/open-document.ts`.**

### Left as is (noted, not fixed)
- Scope additions that are harmless and kept: an undoable revert (a `revert` Checkpoint first), Browse links to other Project HTML files opening in the editor, Allow everything approving requests already waiting, Draw ignoring elements under 300 px², unknown tools asking under the Editor preset.
- Pick Annotations sending no full-page screenshot: the Annotations decision only specifies screenshots for drawings; item 4 adds an element crop.
- Nested git repos inside a Project stay out of Checkpoints; Checkpoints have no size guard beyond item 3's per-file cap.
- Symlinked folders aren't followed when finding Documents (safer; see item 1).
- "Workspace" in a comment in `Cover.tsx` refers to Margin's own product; fine.
