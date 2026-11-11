import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createHost, type Host } from '../../src/main/host'
import { createClaudeCodeProvider } from '../../src/main/agent/claude'
import type { ClaudeSystem, RunResult } from '../../src/main/agent/claude/system'

// The Claude Code provider runs against a pretend Mac: a scripted `claude`,
// login shell, installer and Terminal. No test runs the real ones.

interface Machine {
  /** Where `claude` is, if installed, and what it reports. */
  claude?: { path: string; version: string; auth: Record<string, unknown> }
  /** Whether the login shell's PATH finds `claude`. */
  onShellPath?: boolean
  /** What Anthropic's installer does when run. */
  installer?: 'works' | 'fails'
  /** Whether the user finishes `claude auth login` in Terminal, and on which status check. */
  login?: { signedInOnCheck: number } | 'abandoned'
}

let dataDir: string
let host: Host

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'margen-data-'))
})

afterEach(async () => {
  host?.dispose()
  await rm(dataDir, { recursive: true, force: true })
})

const OFFICIAL_INSTALLER = 'curl -fsSL https://claude.ai/install.sh | bash'
const signedIn = { loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max' }
const signedOut = { loggedIn: false, authMethod: 'none' }

function pretendMac(machine: Machine) {
  const ran: string[] = []
  let terminalOpened = false
  let checksSinceLogin = 0
  const ok = (stdout: string): RunResult => ({ exitCode: 0, stdout, stderr: '' })
  const system: ClaudeSystem = {
    home: '/Users/me',
    shell: '/bin/zsh',
    async run(file, args) {
      ran.push([file, ...args].join(' '))
      if (file === '/bin/bash' && args.join(' ') === `-c ${OFFICIAL_INSTALLER}`) {
        if (machine.installer === 'fails') return { exitCode: 1, stdout: '', stderr: 'curl: (6) Could not resolve host: claude.ai\n' }
        machine.claude = { path: '/Users/me/.local/bin/claude', version: '2.1.322', auth: signedOut }
        machine.onShellPath = false
        return ok('Claude Code successfully installed!\n')
      }
      const claude = machine.claude
      if (file === '/bin/zsh' && args.join(' ') === '-ilc command -v claude') {
        return claude && machine.onShellPath !== false ? ok(`some rc noise\n${claude.path}\n`) : { exitCode: 1, stdout: '', stderr: '' }
      }
      if (claude && file === claude.path && args.join(' ') === '--version') return ok(`${claude.version} (Claude Code)\n`)
      if (claude && file === claude.path && args.join(' ') === 'auth status') {
        if (terminalOpened && typeof machine.login === 'object' && ++checksSinceLogin >= machine.login.signedInOnCheck) {
          claude.auth = signedIn
        }
        return { exitCode: claude.auth.loggedIn ? 0 : 1, stdout: JSON.stringify(claude.auth), stderr: '' }
      }
      return { exitCode: 127, stdout: '', stderr: `${file}: command not found` }
    },
    async isExecutable(path) {
      return machine.claude?.path === path
    },
    async openTerminal(command) {
      ran.push(`Terminal: ${command}`)
      terminalOpened = true
    },
    async sleep() {},
  }
  return { system, ran }
}

describe('detecting Claude Code', () => {
  test('reports not installed when no claude can be found', async () => {
    const { system } = pretendMac({})
    host = createHost({ dataDir, agent: createClaudeCodeProvider(system) })
    expect(await host.call('agent.detect')).toEqual({ installed: false, signedIn: false })
  })
  test('reports the version, the sign-in and the plan of the claude on the login shell PATH', async () => {
    const { system } = pretendMac({ claude: { path: '/opt/homebrew/bin/claude', version: '2.1.287', auth: signedIn } })
    host = createHost({ dataDir, agent: createClaudeCodeProvider(system) })
    expect(await host.call('agent.detect')).toEqual({
      installed: true,
      path: '/opt/homebrew/bin/claude',
      version: '2.1.287',
      signedIn: true,
      plan: 'max',
    })
  })
  test("finds the native installer's claude in ~/.local/bin when the shell PATH lacks it, and reports it signed out", async () => {
    const { system } = pretendMac({
      claude: { path: '/Users/me/.local/bin/claude', version: '2.1.300', auth: signedOut },
      onShellPath: false,
    })
    host = createHost({ dataDir, agent: createClaudeCodeProvider(system) })
    expect(await host.call('agent.detect')).toEqual({
      installed: true,
      path: '/Users/me/.local/bin/claude',
      version: '2.1.300',
      signedIn: false,
    })
  })
})

describe('installing Claude Code', () => {
  test("Install runs Anthropic's official installer, then finds the new claude", async () => {
    const { system, ran } = pretendMac({ installer: 'works' })
    host = createHost({ dataDir, agent: createClaudeCodeProvider(system) })

    expect(await host.call('agent.install')).toEqual({
      ok: true,
      status: { installed: true, path: '/Users/me/.local/bin/claude', version: '2.1.322', signedIn: false },
    })
    expect(ran).toContain(`/bin/bash -c ${OFFICIAL_INSTALLER}`)
  })
  test('a failing installer ends Install in failed, with what went wrong', async () => {
    const { system } = pretendMac({ installer: 'fails' })
    host = createHost({ dataDir, agent: createClaudeCodeProvider(system) })

    expect(await host.call('agent.install')).toEqual({
      ok: false,
      status: { installed: false, signedIn: false },
      message: 'curl: (6) Could not resolve host: claude.ai',
    })
  })
})

describe('signing in to Claude', () => {
  test('Sign in opens Terminal running claude auth login and waits until claude reports signed in', async () => {
    const { system, ran } = pretendMac({
      claude: { path: '/Users/me/.local/bin/claude', version: '2.1.322', auth: signedOut },
      login: { signedInOnCheck: 3 },
    })
    host = createHost({ dataDir, agent: createClaudeCodeProvider(system) })

    expect(await host.call('agent.signIn')).toEqual({
      ok: true,
      status: { installed: true, path: '/Users/me/.local/bin/claude', version: '2.1.322', signedIn: true, plan: 'max' },
    })
    expect(ran).toContain("Terminal: '/Users/me/.local/bin/claude' auth login")
  })
  test('Sign in ends in failed when the login in Terminal is never finished', async () => {
    const { system } = pretendMac({
      claude: { path: '/Users/me/.local/bin/claude', version: '2.1.322', auth: signedOut },
      login: 'abandoned',
    })
    host = createHost({ dataDir, agent: createClaudeCodeProvider(system) })

    expect(await host.call('agent.signIn')).toMatchObject({ ok: false, status: { installed: true, signedIn: false } })
  })

  test('Sign in needs Claude Code installed first', async () => {
    const { system, ran } = pretendMac({})
    host = createHost({ dataDir, agent: createClaudeCodeProvider(system) })

    expect(await host.call('agent.signIn')).toMatchObject({ ok: false, status: { installed: false } })
    expect(ran.filter((line) => line.startsWith('Terminal'))).toEqual([])
  })
})
