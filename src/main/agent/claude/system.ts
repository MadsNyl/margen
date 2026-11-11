// The parts of the Mac the Claude Code provider touches: running programs,
// probing paths and opening Terminal. Tests pass a pretend one; the app
// passes `createNodeSystem()` from ./node-system.

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
}
