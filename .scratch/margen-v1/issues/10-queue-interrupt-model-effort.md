# 10: Queue, interrupt, model and effort

**What to build:** Sending while a Turn runs puts the message in a visible Queue; queued messages go out as their own Turns, in order, after the current Turn ends, and can be removed before they send. Stop (or Esc when nothing else is open) interrupts the running Turn and holds the Queue until the user sends again. The Composer's model and effort picker sets them for the next Turns (user stories 69–74).

**Blocked by:** 07

**Status:** ready-for-agent

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [ ] Queue ordering, removal and hold-after-interrupt are covered by Seam 1 tests with a slow fake Turn
- [ ] Interrupt reaches the AgentProvider and the chat shows the Turn as interrupted
- [ ] The Send button becomes Queue during a Turn and the Queue panel shows above the Composer, as in the prototype
- [ ] Model and effort choices are passed to the Agent (tested with the fake provider)


**Research findings to respect** (details in `/Users/madsnylund/.t3/projects/margen-notes/`, see README.md there):
- Claude Code merges messages that arrive mid-Turn into the running Turn; hold each queued message until the previous Turn has fully ended (turn-end/result), then send.
