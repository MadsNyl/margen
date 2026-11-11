# Agents run on the user's own CLI login; the app never handles credentials

We run Claude Code through the Claude Agent SDK, pointed at the user's own installed `claude` binary. We run Codex by spawning the user's own `codex app-server` over stdio. In both cases the user signs in with the official CLI (`claude auth login`, `codex login`), and we never offer a login of our own or read, store or forward tokens. Anthropic's terms forbid third-party apps from offering claude.ai login or routing subscription credentials. They do allow a user to sign their own unmodified `claude` into their subscription. T3 Code follows this pattern and stays closest to the allowed case. Don't "improve" onboarding by adding an in-app OAuth flow (as Craft Agents does). See `docs/research/desktop-agent-apps.md`.

## Consequences

The first-run experience has to detect the CLIs and send the user to the official installer and login. We take a dependency on whatever `claude`/`codex` version the user has installed, so we must handle protocol differences between versions and tolerate them gracefully.
