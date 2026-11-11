<img src="assets/icon.svg" width="64" height="64" alt="">

# Margen

Point at it, circle it, make it real: a desktop editor for HTML that runs on your own Claude Code. The first open-source part of Margin.

Created in [T3 Code](https://t3.codes).

## Running it

You need Node 22+ and pnpm 10 (`corepack enable` gives you the pinned version). Mac only for now; nothing in the code is Mac-only, so Windows can follow.

```sh
pnpm install
pnpm dev        # the app, with hot reload
pnpm build      # builds main, preload and renderer into out/
pnpm start      # runs the built app
pnpm dist:local # an unsigned .dmg for your Mac's architecture, in dist/
```

The unsigned build opens with a Gatekeeper warning (right-click, Open). Only release builds are signed and notarized.

## Tests

```sh
pnpm test       # Seam 1: the host API against temp folders, with a fake Agent (Vitest)
pnpm e2e        # Seam 2: builds, then drives the real app window (Playwright + Electron)
pnpm typecheck
pnpm lint

# The contract test: one tiny Turn against your own installed, signed-in claude.
# It uses a little of your plan, so it's skipped unless you ask for it.
MARGEN_CLAUDE_CONTRACT=1 pnpm vitest run test/contract   # MARGEN_CLAUDE_MODEL=haiku by default
```

Seam 1 tests call `createHost()` directly with a temporary data directory and a scripted fake AgentProvider, so they need no window and no `claude`. The Claude Code adapter is tested the same way, with a pretend `ClaudeSystem` (`src/main/agent/claude/system.ts`) standing in for `claude`, the login shell, the installer and Terminal; its `query` plays back scripted Agent SDK messages. Seam 2 tests launch the built app through `e2e/app.ts`, which gives each test a fresh data directory (`MARGEN_DATA_DIR`), a fake Agent script (`MARGEN_FAKE_AGENT`), a temporary stand-in for `~/Documents/Margen` where New project makes its folders (`MARGEN_PROJECTS_DIR`) and, when asked, the folder the folder picker returns (`MARGEN_PICK_FOLDER`).

If Electron starts as plain Node (`app` is undefined), your shell has `ELECTRON_RUN_AS_NODE=1`, which happens inside terminals of other Electron apps. Run `unset ELECTRON_RUN_AS_NODE` first. The e2e helper strips it for you.

## Releasing

`.github/workflows/release.yml` builds, signs and notarizes the `.dmg` (arm64 and x64) on a macOS runner and publishes it to GitHub Releases. To release:

1. Set `version` in `package.json` (say `0.1.0`), commit, and push.
2. Tag that commit `v0.1.0` and push the tag. The workflow refuses a tag that doesn't match the version, runs every check, and stops before building if a signing secret is missing.

The packaging config is `electron-builder.yml`; the publish target (owner and repo) comes from `repository` in `package.json`. It also defines a Windows (NSIS) target that isn't built yet: nothing in the app is Mac-only, so a Windows job can be added later.

### Secrets

Add these under the repo's Settings → Secrets and variables → Actions. None of them belong in the repo.

| Secret | What it is |
| --- | --- |
| `MAC_CERTIFICATE_P12_BASE64` | Your **Developer ID Application** certificate with its private key, exported from Keychain Access as a `.p12`, then `base64 -i cert.p12 \| pbcopy`. |
| `MAC_CERTIFICATE_PASSWORD` | The password you gave the `.p12` when exporting it. |

For notarization, set **either** an App Store Connect API key (recommended):

| Secret | What it is |
| --- | --- |
| `APPLE_API_KEY_P8` | The full text of the `AuthKey_XXXXXXXXXX.p8` file (App Store Connect → Users and Access → Integrations → Team Keys, with the Developer role). |
| `APPLE_API_KEY_ID` | The key's ID (the `XXXXXXXXXX`). |
| `APPLE_API_ISSUER` | The Issuer ID shown above the keys list. |

**or** your Apple ID:

| Secret | What it is |
| --- | --- |
| `APPLE_ID` | The Apple ID email of the developer account. |
| `APPLE_APP_SPECIFIC_PASSWORD` | An app-specific password from account.apple.com → Sign-In and Security. |
| `APPLE_TEAM_ID` | The 10-character Team ID from developer.apple.com → Membership. |

The workflow publishes with the built-in `GITHUB_TOKEN`; no token secret is needed.

To check a downloaded release: `spctl -a -vvv -t install /Applications/Margen.app` should say `source=Notarized Developer ID`, and `xcrun stapler validate Margen-0.1.0-arm64.dmg` should pass.

### Auto-update

A packaged Margen checks GitHub Releases 10 seconds after launch and every 4 hours (electron-updater, reading the `latest-mac.yml` and `.zip` the release publishes). A newer version downloads in the background and installs when you quit, or right away through the `update.install` host call. Dev runs and tests have no release feed, so their update status is `unavailable`. The only request this makes is to GitHub's releases feed; nothing about you or your files is sent.

To try an update against a test release: install a signed release (say `0.1.0`), then publish `0.1.1-test.1` with the workflow and mark it as a pre-release on GitHub. Launch the installed app with `MARGEN_UPDATE_PRERELEASE=1 /Applications/Margen.app/Contents/MacOS/Margen`; it picks up the pre-release, downloads it, and is on `0.1.1-test.1` after you quit and reopen it. Delete the test release afterwards. macOS only installs updates into a signed app, so this needs a real release, not `pnpm dist:local`.

## License

MIT, see `LICENSE`.

## Code layout

```
src/shared/      Types shared by every process: the host API contract (host-api.ts) and Agent data (agent.ts)
src/main/        The main process: everything that touches the disk or the Agent
  index.ts       Electron bootstrap only (windows, security, wiring)
  ipc.ts         Adapter from the host API to Electron IPC
  auto-update.ts Adapter from electron-updater to the update source
  host/          createHost(): the host API, composed from the domain modules below
  agent/         The AgentProvider interface, the fake provider, and the Claude Code adapter (claude/)
  projects/      Projects, recents, Document discovery and watching
  sessions/      The open Document's Session: its entries and the Agent session behind it
  permissions/   The permission policy: which tool calls run without asking
  updates/       Auto-update state, behind an injectable release feed
src/preload/     index.ts exposes the host API as window.margen, and nothing else;
                 document.ts is Margen's script inside the Document view (the <webview>'s preload)
src/renderer/    The React UI (screens/, components/, editor/, host.ts)
test/seam1/      Host API tests (Vitest)
test/contract/   The opt-in test against the real claude
e2e/             Real app window tests (Playwright)
```

### Turns

Sending in the Composer calls `session.send`. The open Document's Session (`src/main/sessions/`) starts the Agent session on its first Turn and passes each AgentEvent on as a `session.entry` event, numbered so the chat can catch up through `session.current`. The Claude Code adapter (`src/main/agent/claude/session.ts`) keeps one `query()` of the Agent SDK running per Session, always pointed at the user's own `claude` (`pathToClaudeCodeExecutable`, never the SDK's bundled binary), in the Project folder, with the login shell's environment, the user's Claude settings files left out (`settingSources: []`) and summarised thinking. `messages.ts` maps the SDK's messages to AgentEvents and skips any it doesn't know. Tool calls go through one permission policy (`src/main/permissions/`); "ask" becomes an approval-request in the chat.

### The Document view

The editor renders the Document in a `<webview>` on its own session (`persist:margen-doc`), which serves the open Project's files from `margen-doc://<project id>/<path>`: one stable origin per Project, so the page's localStorage works. `src/main/index.ts` forces every webview to that partition, `sandbox`, no Node and Margen's own preload (`src/preload/document.ts`), which runs in an isolated world: it reads the page's DOM, but the page can't see it and nothing is written into the page or the file. The editor and that script talk over the typed Document bridge in `src/shared/document-bridge.ts`. The built app's CSP (in `electron.vite.config.ts`) is relaxed by exactly `frame-src margen-doc:` for it.

The domain modules under `src/main/` are plain TypeScript with no Electron imports, so tests can use them directly.
