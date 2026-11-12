# Can users bring their own Claude subscription to another app?

Checked 2026-11-12 against Anthropic's own pages (quotes verbatim). No "last updated" dates on the docs pages; the support article's notices are dated 2026-06-15 and 2026-10-07. Not legal advice.

## Short answer

There is no "bring your own subscription" program for third-party apps. Anthropic forbids apps from offering claude.ai login or routing requests through a user's plan, unless Anthropic approved it beforehand. There is one carve-out: an end user may sign in to the **unmodified** Claude Code binary with their own subscription, including when a platform hosts Claude Code. Whether an Agent SDK app that runs the user's own `claude` login falls under that carve-out is not stated. One page's wording points each way. Margen's design (ADR 0002) stays as close to the carve-out as possible, but only Anthropic can confirm it.

## What the pages say

**Legal and compliance** (https://code.claude.com/docs/en/legal-and-compliance), "Authentication and credential use":
- "OAuth authentication is intended exclusively for purchasers of Claude Free, Pro, Max, Ultra, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications."
- "Developers building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication through Claude Console or a supported cloud provider."
- "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users."
- "Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens — sign-in to a Claude account must complete through Anthropic's own flow."
- The carve-out: "Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription, including where a platform hosts Claude Code as described under *Can customers offer Claude Code in their products?* above."
- Hosting Claude Code requires the Commercial Terms, plus: "The Claude Code binary must not be modified." Also: "Customers may not pay for, resell, or intermediate Claude usage on their end users' behalf. Each end user must authenticate with their own Anthropic API key, Claude subscription plan credentials, or 3P inference provider credential…"
- "For questions about permitted authentication methods for your use case, please contact sales."

**Agent SDK overview** (https://code.claude.com/docs/en/agent-sdk/overview):
- "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key authentication methods described in the Quickstart instead."
- It describes the SDK as "A library that runs the Claude Code binary".
- No page explains how to get approval. The only route is contacting sales.

**Billing** (https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan):
- 2026-06-15: "We've paused the previously-announced changes to Claude Agent SDK usage. For now, nothing has changed". Also: "Claude Agent SDK, `claude -p`, and third-party app usage still draw from your subscription limits."
- 2026-10-07: "when you're signed in with your Claude plan, the Claude Agent SDK and `claude -p` still draw from your subscription limits."
- The paused plan would have given a separate monthly credit, covering "third-party apps that authenticate with your Claude subscription through the Agent SDK". That wording comes from search snippets of an earlier version of the article, so treat it as secondary. It suggests Anthropic expected such apps to exist.

**API credits for subscribers** (https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers):
- The sanctioned way to "build and run your own applications and agents" on a plan. Max $100, Ultra $200 and Team up to $500 (pooled) a month in API credits, for the API, Managed Agents and the Agent SDK *with an API key* from a linked Console organization.
- They don't cover Claude Code itself. Free, Pro and Enterprise aren't eligible. Unused credits expire each billing cycle.

**Secondary reporting.** Gigazine and WinBuzzer (Feb 2026) report enforcement against third-party apps using subscription OAuth tokens, starting around 2026-01-09. The docs were clarified around 2026-02-19.

## What this means for Margen

- In line with the rules: Margen offers no login of its own. Sign-in happens through `claude auth login` (Anthropic's own flow). Margen never reads, stores or forwards tokens, runs the user's own unmodified `claude`, and never pays for or resells usage.
- The grey area: Margen is "built on the Claude Agent SDK", and the overview's note tells such apps to use API keys "unless previously approved". T3 Code, Conductor and Nimbalyst ship the same way openly.
- Before launch: ask Anthropic (via sales) to confirm that an open-source app driving the user's own `claude` login through the SDK falls under the carve-out.
- Fallback: users can sign their own `claude` in with an API key, or use a Max/Team plan's API credits. Margen still never touches the key.
