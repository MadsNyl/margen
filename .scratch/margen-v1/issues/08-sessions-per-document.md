# 08: Sessions per Document

**What to build:** Each Document has one active Session; switching Documents switches the chat. "New session" starts fresh; the history drawer lists a Document's past Sessions to resume, through the AgentProvider's resume. Sessions survive quitting and reopening Margen (user stories 86–91).

**Blocked by:** 07

**Status:** ready-for-agent

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [ ] Sessions are stored per Project and Document in Margen's data directory with their Agent session id (Seam 1 tests, including across a simulated restart)
- [ ] Switching Documents shows that Document's active Session
- [ ] New session and resume work through the host API and the history drawer
- [ ] The Agent can still read and change other files in the Project during a Document's Session
