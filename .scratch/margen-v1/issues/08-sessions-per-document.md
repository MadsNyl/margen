# 08: Sessions per Document

**What to build:** Each Document has one active Session; switching Documents switches the chat. "New session" starts fresh; the history drawer lists a Document's past Sessions to resume, through the AgentProvider's resume. Sessions survive quitting and reopening Margen (user stories 86–91).

**Blocked by:** 07

**Status:** done

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [x] Sessions are stored per Project and Document in Margen's data directory with their Agent session id (Seam 1 tests, including across a simulated restart)
- [x] Switching Documents shows that Document's active Session
- [x] New session and resume work through the host API and the history drawer
- [x] The Agent can still read and change other files in the Project during a Document's Session


**Research findings to respect** (details in `/Users/madsnylund/.t3/projects/margen-notes/`, see README.md there):
- Check what resume does with credentials (the note says the SDK reads keychain credentials on resume); keep it within ADR 0002, i.e. it must be the user's own `claude` doing it, never Margen.

## Notes from ticket 08 (for 09–14)

- **Where:** `src/main/sessions/store.ts` stores a Project's Sessions in `<data dir>/sessions/<project id>/`: `index.json` (every Session's `id`, `document`, `number`, `startedAt`, `agentSessionId`, `turns`, `firstMessage`, and each Document's active Session) and `<session id>.json` (its entries). Writes are synchronous so a Session put away while quitting is on disk. `src/main/sessions/document.ts` `documentSessions` holds one Document's active Session and switches it; the host makes one in `openDocument` and keeps `session` pointing at the active `DocumentSession`, so the existing `session.*` handlers are unchanged.
- **When it saves:** on each user entry, each turn-end, until the Agent session id is known, and when the Session is put away (switching Documents, New session, resume, quitting). Text deltas mid-Turn are only saved at those points. A Turn still running when its Session is put away gets a `turn-end` `interrupted` appended, in memory and on disk. Switching Documents or Sessions during a Turn closes the Agent session (as in 07); ticket 10 may want to refuse or ask.
- **Host API:** `SessionView` grew `id` (Margen's, not the Agent's) and `number`. New calls: `session.new` (keeps an empty Session rather than piling up empty ones), `session.resume(id)` (rejects other Documents' Sessions), `sessions.list` (the open Document's stored Sessions, newest first, with `active`). `session.entry` carries `session` (the id); the new event `session.changed` sends the new `SessionView` after New session or resume. The chat drops entries of any other Session.
- **Resume:** a stored Session's `agentSessionId` goes to `startSession({ resumeId })` on its next Turn, so the Agent sees the earlier conversation. Only Sessions with a Turn are stored, so every stored one has an Agent session id.
- **Credentials (ADR 0002):** checked SDK 0.3.322: the code that reads the keychain (`security find-generic-password`) and `~/.claude/.credentials.json` and copies them into a temp `claude-resume-*` config dir runs only when a `sessionStore` option is passed (it materialises the transcript from that store). Margen passes plain `resume` and no `sessionStore`, so the user's own `claude` reads its own login and transcript. Never pass `sessionStore`.
- **UI:** the chat header shows `· Session N`, New session (+) and Sessions & Checkpoints (clock), which opens `editor/HistoryDrawer.tsx` (a `region` "History" over the chat). Its Checkpoints tab is there but disabled; **ticket 11** fills that tab's panel (the `{/* Ticket 11 … */}` comment marks it) and can use `SessionSummary.number` for "Session 2" in each Checkpoint's line. The drawer shows and hides without the prototype's slide animation.
- **11 (Checkpoints):** Checkpoints belong to the Project, so store them next to, not inside, `sessions/<project id>/`; the active Session's `id`/`number` is in `session.current` if a Checkpoint should name its Session.
- **Not done:** Sessions of a renamed or deleted Document stay in the index under the old path, unlisted.

