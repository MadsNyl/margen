# 03: Open a folder and the Project page

**What to build:** From the Start screen, "Open a folder" (⌘O) makes any folder a Project and shows the Project page: a grid of every HTML file in it as Documents, with name, subfolder, last-edited time and a generated cover in Margin's style. `node_modules`, `.git`, common build folders and `.gitignore`d paths are skipped. The grid updates when files are added, renamed or removed. The Start screen lists recent Projects with HTML-file count and path, can clear the list, and shows a moved or deleted Project as missing (user stories 9–20, 25–26).

**Blocked by:** 01

**Status:** ready-for-agent

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [ ] Document discovery is exposed through the host API and covered by Seam 1 tests on temp folders (nested HTML, ignored folders, .gitignore)
- [ ] The Documents list pushes an update event when files change on disk (tested)
- [ ] Recent Projects persist across restarts in Margen's own data directory, never inside the user's folder
- [ ] The Project page matches the prototype: project switcher, grid of Documents with covers, "Back to Start"
- [ ] A Seam 2 test opens a fixture folder and sees its HTML files listed
