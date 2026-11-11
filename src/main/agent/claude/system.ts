import type { Options, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

// The parts of the Mac the Claude Code provider touches: running programs,
// probing paths, opening Terminal and running `claude` through the Agent SDK.
// Tests pass a pretend one; the app passes `createNodeSystem()` from ./node-system.

export interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface ClaudeSystem {
  /** The user's home directory. */
  home: string
  /** The user's login shell ($SHELL), used to find `claude` on their own PATH. */
  shell: string
  /** Runs a program without a shell. Resolves with the exit code; never rejects for a non-zero exit. */
  run(file: string, args: string[], opts?: { timeoutMs?: number }): Promise<RunResult>
  isExecutable(path: string): Promise<boolean>
  /** Opens a new Terminal window running `command`. */
  openTerminal(command: string): Promise<void>
  sleep(ms: number): Promise<void>
  /** The user's login-shell environment (PATH and all), which a GUI app doesn't inherit. */
  loginEnv(): Promise<Record<string, string>>
  /** The Agent SDK's `query()`: runs `options.pathToClaudeCodeExecutable` and yields its messages. */
  query(params: { prompt: AsyncIterable<SDKUserMessage>; options: Options }): ClaudeRun
}

/** How long a quick run (`claude --version`, `claude auth status`, the login shell) may take. */
export const QUICK_RUN_MS = 10_000

/** Runs `command` in the user's login shell, as Terminal would, so their PATH and profile apply. */
export function runInLoginShell(system: Pick<ClaudeSystem, 'run' | 'shell'>, command: string): Promise<RunResult> {
  return system.run(system.shell, ['-ilc', command], { timeoutMs: QUICK_RUN_MS })
}

/** A running `query()`. Messages are typed `unknown`: the user's `claude` may be older or newer than the SDK. */
export interface ClaudeRun extends AsyncIterable<unknown> {
  interrupt(): Promise<unknown>
  close(): void
}
