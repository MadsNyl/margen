import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { homedir } from 'node:os'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { ClaudeSystem, RunResult } from './system'

/** Marks where the login shell's own output ends and `env` begins. */
const ENV_MARKER = '__MARGEN_ENV__'

/** Variables from Margen's own process that must not reach `claude`. */
const DROPPED_ENV = /^(ELECTRON_|MARGEN_|NODE_OPTIONS$|CHROME_)/

/** The real Mac. Nothing in the tests uses this. */
export function createNodeSystem(env: NodeJS.ProcessEnv): ClaudeSystem {
  function run(file: string, args: string[], { timeoutMs }: { timeoutMs?: number } = {}): Promise<RunResult> {
    return new Promise((resolve) => {
      execFile(file, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
        const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0
        resolve({ exitCode, stdout, stderr: stderr || (error && typeof error.code !== 'number' ? error.message : '') })
      })
    })
  }

  let loginEnv: Promise<Record<string, string>> | undefined

  /** The login shell's environment, as Terminal would give `claude` (T3 Code does the same). */
  async function readLoginEnv(): Promise<Record<string, string>> {
    const shell = env.SHELL || '/bin/zsh'
    const out = await run(shell, ['-ilc', `printf '%s' '${ENV_MARKER}'; /usr/bin/env -0`], { timeoutMs: 10_000 })
    const own = Object.fromEntries(
      Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined && !DROPPED_ENV.test(entry[0])),
    )
    const start = out.stdout.lastIndexOf(ENV_MARKER)
    if (out.exitCode !== 0 || start < 0) return own
    const fromShell = out.stdout
      .slice(start + ENV_MARKER.length)
      .split('\0')
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)] as const)
      .filter(([key]) => key && !DROPPED_ENV.test(key))
    return { ...own, ...Object.fromEntries(fromShell) }
  }

  return {
    home: homedir(),
    shell: env.SHELL || '/bin/zsh',
    run,
    async isExecutable(path) {
      try {
        await access(path, constants.X_OK)
        return true
      } catch {
        return false
      }
    },
    async openTerminal(command) {
      const script = `"${command.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
      const result = await run('/usr/bin/osascript', [
        '-e',
        `tell application "Terminal" to do script ${script}`,
        '-e',
        'tell application "Terminal" to activate',
      ])
      if (result.exitCode !== 0) throw new Error(result.stderr.trim() || 'Could not open Terminal')
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    loginEnv: () => (loginEnv ??= readLoginEnv()),
    query: (params) => query(params),
  }
}
