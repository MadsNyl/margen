# 01: App shell, host API and test harnesses

**What to build:** The Electron app boots on macOS to an empty Start screen in Margin's light design (grey shell, white card, the "margen" wordmark and mark). The main process exposes a typed **host API** (spec: Implementation Decisions, Shell and processes) with at least one call and one event wired through to the UI. An **AgentProvider** interface exists with a **fake AgentProvider** that plays back scripted AgentEvents. Both test seams from the spec's Testing Decisions are set up and proven with one real test each.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `.scratch/margen-v1/spec.md`. Visual reference: `design/index.html`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

- [ ] `npm`/`pnpm` scripts: dev, build, test (Seam 1), e2e (Seam 2), typecheck, lint
- [ ] The app launches with `dev` and shows the Start screen shell styled after `design/index.html`
- [ ] A typed host API module is the only bridge between renderer and main (context isolation on, no Node in the renderer)
- [ ] The AgentProvider interface matches the spec's shape; a fake provider can be scripted from tests
- [ ] One Seam 1 test calls the host API directly against a temporary folder and passes
- [ ] One Seam 2 Playwright test launches the built Electron app and asserts the Start screen, and passes
- [ ] README explains how to run the app and the tests
