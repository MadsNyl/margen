# 15: Project page chat bar

**What to build:** The Project page's "Let us build …" bar with rotating coloured words. Describing something creates a new Document (named from the description, unique) and opens it in the editor with its Session already running the message. A message that `@`-mentions an existing Document opens that Document and sends the message to its Session instead (user stories 21–23; spec: Sessions).

**Blocked by:** 04, 08

**Status:** ready-for-agent

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [ ] Seam 1 tests: description → new file created + Turn started on its Session; `@file.html` → existing Document's Session gets the message
- [ ] `@` offers a picker of the Project's Documents
- [ ] The bar and title match the prototype, including on an empty Project

- From ticket 03: the chat bar and empty state live in the Project page component; its send button is always disabled for now.

- From ticket 04: after creating a new Project, move focus into the chat bar (the design does). Project names are folder slugs.
