# 05: Open a Document in the editor, with live reload

**What to build:** Clicking a Document opens the editor: the Document rendered live on the left in a sandboxed view (scripts and network allowed, no Node), the chat panel on the right (empty for now), and a breadcrumb margen / Project / Document whose dropdown switches to another Document in the Project. "Open in browser" opens it in the default browser. When the file changes on disk the Document reloads once (debounced), keeps its scroll position and shows a brief "Reloaded" notice. Margen never writes to the Document (user stories 27–32, 35–36).

**Blocked by:** 03

**Status:** ready-for-agent

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [ ] The rendered copy has Margen's script injected; the file on disk is never modified (tested)
- [ ] Several quick writes to the file cause one reload (Seam 1 test on the watch event; Seam 2 test on the view)
- [ ] Scroll position is restored after a reload (Seam 2 test)
- [ ] The breadcrumb dropdown lists the Project's Documents and switches between them
- [ ] The editor layout and toolbar placement match the prototype (toolbar may be empty until ticket 12)
