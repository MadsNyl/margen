# 17: Signed releases and auto-update

**What to build:** A CI workflow builds a signed and notarized macOS `.dmg` (Apple Developer account exists) and publishes it to GitHub Releases; the app checks those releases and updates itself (user stories 95–97).

**Blocked by:** 01

**Status:** done

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [x] A release workflow builds, signs and notarizes the app using secrets documented in the README (no secrets committed)
- [x] Auto-update is wired to GitHub Releases and can be exercised against a test release
- [x] The build config keeps Windows possible later (no Mac-only code in the core)
- [x] LICENSE (MIT) present

**Needs a real release to verify:** signing and notarization (`.github/workflows/release.yml`) can't run without the Developer ID certificate and Apple credentials, and there is no GitHub remote yet. What was verified locally: `pnpm dist:local` builds an unsigned dmg that mounts and launches, the packaged `app-update.yml` points at `MadsNyl/margen` on GitHub, and the packaged app runs its first update check against that feed (404 until the repo exists, reported as a `failed` status). The update state machine is covered by `test/seam1/updates.test.ts`. Installing an update end to end needs two signed releases; the steps are in the README under "Auto-update". There is no update UI yet: a ready update installs on quit, and Settings (16) can show `update.status` and offer `update.install`.
