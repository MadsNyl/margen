<img src="assets/icon.svg" width="64" height="64" alt="">

# Margen

Point at it, circle it, make it real: a desktop editor for HTML that runs on your own Claude Code. The first open-source part of Margin.

Created in [T3 Code](https://t3.codes).

## Running it

You need Node 22+ and pnpm 10 (`corepack enable` gives you the pinned version). Mac only for now.

```sh
pnpm install
pnpm dev        # the app, with hot reload
pnpm build      # builds main, preload and renderer into out/
pnpm start      # runs the built app
```

## Tests

```sh
pnpm test       # Seam 1: the host API against temp folders, with a fake Agent (Vitest)
pnpm e2e        # Seam 2: builds, then drives the real app window (Playwright + Electron)
pnpm typecheck
pnpm lint
```

Seam 1 tests call `createHost()` directly with a temporary data directory and a scripted fake AgentProvider, so they need no window and no `claude`. The Claude Code adapter is tested the same way, with a pretend `ClaudeSystem` (`src/main/agent/claude/system.ts`) standing in for `claude`, the login shell, the installer and Terminal. Seam 2 tests launch the built app through `e2e/app.ts`, which gives each test a fresh data directory (`MARGEN_DATA_DIR`) and a fake Agent script (`MARGEN_FAKE_AGENT`).

If Electron starts as plain Node (`app` is undefined), your shell has `ELECTRON_RUN_AS_NODE=1`, which happens inside terminals of other Electron apps. Run `unset ELECTRON_RUN_AS_NODE` first. The e2e helper strips it for you.

## Code layout

```
src/shared/      Types shared by every process: the host API contract (host-api.ts) and Agent data (agent.ts)
src/main/        The main process: everything that touches the disk or the Agent
  index.ts       Electron bootstrap only (windows, security, wiring)
  ipc.ts         Adapter from the host API to Electron IPC
  host/          createHost(): the host API, composed from the domain modules below
  agent/         The AgentProvider interface, the fake provider, and the Claude Code adapter (claude/)
  projects/      Projects, recents, and later Document discovery and watching
src/preload/     Exposes the host API as window.margen, and nothing else
src/renderer/    The React UI (screens/, components/, host.ts)
test/seam1/      Host API tests (Vitest)
e2e/             Real app window tests (Playwright)
```

The domain modules under `src/main/` are plain TypeScript with no Electron imports, so tests can use them directly.
