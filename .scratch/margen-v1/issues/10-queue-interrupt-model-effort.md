# 10: Queue, interrupt, model and effort

**What to build:** Sending while a Turn runs puts the message in a visible Queue; queued messages go out as their own Turns, in order, after the current Turn ends, and can be removed before they send. Stop (or Esc when nothing else is open) interrupts the running Turn and holds the Queue until the user sends again. The Composer's model and effort picker sets them for the next Turns (user stories 69–74).

**Blocked by:** 07

**Status:** done

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [x] Queue ordering, removal and hold-after-interrupt are covered by Seam 1 tests with a slow fake Turn
- [x] Interrupt reaches the AgentProvider and the chat shows the Turn as interrupted
- [x] The Send button becomes Queue during a Turn and the Queue panel shows above the Composer, as in the prototype
- [x] Model and effort choices are passed to the Agent (tested with the fake provider)


**Research findings to respect** (details in `/Users/madsnylund/.t3/projects/margen-notes/`, see README.md there):
- Claude Code merges messages that arrive mid-Turn into the running Turn; hold each queued message until the previous Turn has fully ended (turn-end/result), then send.

## Notes from ticket 10 (for later tickets)

- **Host API:** `session.send` now queues while a Turn runs, instead of rejecting. New: `session.queue` → `QueueView { document, messages: { id, turn }[], held }` (`null` with no Document), `session.unqueue(id)`, `session.interrupt()`, and the event `session.queue` on every change. `SessionView` is unchanged; the Queue sits beside it.
- **Where:** the Queue logic is `src/main/turns/queue.ts` (`createTurnQueue`); `startDocumentSession` starts each Turn through it and calls `turnEnded()` only after the turn-end entry has been added, so the next queued Turn reaches the Agent only after the previous one has fully ended (research finding). The Queue lives in memory with the Session; 08 may want to persist it, or leave it out (a restart drops queued messages).
- **Held:** `interrupt()` holds the Queue straight away (so a Turn that happens to finish as Stop is pressed doesn't release the next one). A **failed** Turn holds it too (a judgment call: if Claude Code is signed out, every queued message would fail the same way). Sending again releases it: the new message goes last and the first queued one starts.
- **Model and effort:** `TurnInput` has optional `model` and `effort` (`Effort` in `src/shared/agent.ts`), so a queued message keeps the choice it was sent with. The Claude adapter restarts `claude` on the same session (`resume`) when a Turn's model or effort differ from the running one's; no `setModel()`/`applyFlagSettings()`, so it works on any `claude` version. `StartSessionOptions.model/effort` are now the fallback for Turns that don't choose. The choice is Composer state (`editor/ModelPicker.tsx`) and resets when the Document changes; 16 (Settings) can make it remembered.
- **Interrupt before start:** interrupting a Turn whose message hasn't reached `claude` yet (still detecting or starting) ends it `interrupted` without running it, in both the Claude adapter and the fake.
- **Esc:** `ChatPanel` listens on `window` for Escape while a Turn runs and stops it unless the event's `defaultPrevented`. `useDropdown` now calls `preventDefault()` when Esc closes a menu. **12:** the quick comment box and Pick/Draw should `preventDefault()` an Esc they use. Keys pressed inside the Document view (the webview) don't reach the window; send them over the Document bridge if Esc there should stop a Turn.
- **12 (Composer):** the Composer now takes `queued` and `onStop`; the Queue panel is `editor/Queue.tsx`, above the Composer in `ChatPanel`. The draft is still `text` in `Composer`, and `choice` (model/effort) is separate local state; lift `text` without touching `choice`. The Queue panel shows `turn.text`, or the Annotations' `#n comment` when there's no text.

- **With 08's Sessions:** each `DocumentSession` has its own Queue. New session, resume and switching Documents put the old Session away with its Queue (queued messages are dropped, not carried over); after New session or resume the host sends `session.queue` with the new Session's empty Queue. 08's note asks whether switching during a Turn should be refused or asked about; still open.
