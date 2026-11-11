import { join } from 'node:path'
import type { AgentSetupResult, AgentStatus } from '@shared/agent'
import type { AgentProvider } from '../provider'
import { startClaudeSession } from './session'
import type { ClaudeSystem } from './system'

// The Claude Code AgentProvider. It runs the user's own `claude` and only
// ever reads `claude auth status`; it never touches credentials (ADR 0002).

/** Anthropic's official installer (https://code.claude.com/docs/en/setup). It installs to ~/.local/bin/claude. */
const OFFICIAL_INSTALLER = 'curl -fsSL https://claude.ai/install.sh | bash'

/** How long Sign in waits for the user to finish `claude auth login` in Terminal. */
const SIGN_IN_WAIT_MS = 10 * 60_000
const SIGN_IN_CHECK_MS = 2_000

export function createClaudeCodeProvider(system: ClaudeSystem): AgentProvider {
  /** Ends the Sign in that's waiting, if one is. */
  let cancelWaiting = () => {}

  /**
   * The user's own `claude`: first as their login shell finds it (a GUI app
   * doesn't inherit the shell's PATH), then where the installers put it.
   */
  async function findClaude(): Promise<string | undefined> {
    const lookup = await system.run(system.shell, ['-ilc', 'command -v claude'], { timeoutMs: 10_000 })
    // Shell startup files can print their own lines; the path is the last absolute one.
    const onPath =
      lookup.exitCode === 0
        ? lookup.stdout
            .split('\n')
            .map((line) => line.trim())
            .findLast((line) => line.startsWith('/'))
        : undefined
    const candidates = [onPath, join(system.home, '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude']
    for (const path of candidates) if (path && (await system.isExecutable(path))) return path
    return undefined
  }

  async function detect(): Promise<AgentStatus> {
    const path = await findClaude()
    if (!path) return { installed: false, signedIn: false }
    const versionOut = await system.run(path, ['--version'], { timeoutMs: 10_000 })
    const version = /^(\d+\.\d+\.\d+)/.exec(versionOut.stdout.trim())?.[1]
    const auth = await readAuthStatus(path)
    return {
      installed: true,
      path,
      ...(version && { version }),
      signedIn: auth.loggedIn === true,
      ...(typeof auth.subscriptionType === 'string' && { plan: auth.subscriptionType }),
    }
  }

  async function readAuthStatus(path: string): Promise<{ loggedIn?: unknown; subscriptionType?: unknown }> {
    // Prints JSON either way; exits 1 when signed out.
    const out = await system.run(path, ['auth', 'status'], { timeoutMs: 10_000 })
    try {
      return JSON.parse(out.stdout) as { loggedIn?: unknown; subscriptionType?: unknown }
    } catch {
      return {}
    }
  }

  async function install(): Promise<AgentSetupResult> {
    const run = await system.run('/bin/bash', ['-c', OFFICIAL_INSTALLER], { timeoutMs: 10 * 60_000 })
    const status = await detect()
    if (status.installed) return { ok: true, status }
    const message = lastLine(run.stderr) ?? lastLine(run.stdout) ?? `The installer exited with code ${run.exitCode}`
    return { ok: false, status, message }
  }

  async function signIn(): Promise<AgentSetupResult> {
    let status = await detect()
    if (!status.path) return { ok: false, status, message: 'Install Claude Code first.' }
    if (status.signedIn) return { ok: true, status }
    await system.openTerminal(`${shellQuote(status.path)} auth login`)
    let cancelled = false
    const cancel = new Promise<void>((resolve) => {
      cancelWaiting = () => {
        cancelled = true
        resolve()
      }
    })
    try {
      // Margen can't see the login itself, only `claude auth status` turning true.
      for (let waited = 0; waited < SIGN_IN_WAIT_MS; waited += SIGN_IN_CHECK_MS) {
        await Promise.race([system.sleep(SIGN_IN_CHECK_MS), cancel])
        if (cancelled) return { ok: false, cancelled: true, status, message: 'Sign in cancelled.' }
        status = await detect()
        if (status.signedIn) return { ok: true, status }
      }
      return { ok: false, status, message: 'Not signed in yet.' }
    } finally {
      cancelWaiting = () => {}
    }
  }

  return {
    detect,
    install,
    signIn,
    cancelSignIn: () => cancelWaiting(),
    startSession: (options) => startClaudeSession(system, detect, options),
  }
}

function lastLine(text: string): string | undefined {
  return text
    .split('\n')
    .map((line) => line.trim())
    .findLast(Boolean)
}

function shellQuote(text: string): string {
  return `'${text.replaceAll("'", `'\\''`)}'`
}
