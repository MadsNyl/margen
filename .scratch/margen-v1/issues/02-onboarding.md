# 02: Onboarding: detect, install and sign in to Claude Code

**What to build:** First launch checks for Claude Code. If it's missing, Install runs Anthropic's official installer; Sign in opens Terminal running `claude auth login`. Each step shows missing / working / done / failed, Continue unlocks only when both are done, and onboarding is skipped on later launches while `claude` is still installed and signed in (user stories 1–8). Margen never reads or stores credentials (ADR 0002).

**Blocked by:** 01

**Status:** done

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [x] Detection reports installed, version and signed-in state through the host API (AgentProvider.detect)
- [x] Install and Sign in each show their progress and end in done or failed
- [x] Continue is disabled until both steps are done, then goes to the Start screen
- [x] With a working `claude`, launch skips straight to the Start screen
- [x] Seam 1 tests cover detection results using a fake; no test needs a real `claude`
