import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { homedir } from 'node:os'
import type { ClaudeSystem, RunResult } from './system'

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
  }
}
