# 17: Signed releases and auto-update

**What to build:** A CI workflow builds a signed and notarized macOS `.dmg` (Apple Developer account exists) and publishes it to GitHub Releases; the app checks those releases and updates itself (user stories 95–97).

**Blocked by:** 01

**Status:** ready-for-agent

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [ ] A release workflow builds, signs and notarizes the app using secrets documented in the README (no secrets committed)
- [ ] Auto-update is wired to GitHub Releases and can be exercised against a test release
- [ ] The build config keeps Windows possible later (no Mac-only code in the core)
- [ ] LICENSE (MIT) present
