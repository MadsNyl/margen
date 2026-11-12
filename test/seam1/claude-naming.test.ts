import { describe, expect, test } from 'vitest'
import { createClaudeCodeProvider } from '../../src/main/agent/claude'
import type { ClaudeSystem, RunResult } from '../../src/main/agent/claude/system'

// Naming a new Document: one quick `claude -p` on a small model with no tools,
// run on a pretend Mac whose `claude` replies with `reply`.

const CLAUDE = '/Users/me/.local/bin/claude'

function pretendMac(reply: RunResult | undefined) {
  const runs: string[][] = []
  const system: ClaudeSystem = {
    home: '/Users/me',
    shell: '/bin/zsh',
    async run(file, args) {
      if (file === '/bin/zsh') return { exitCode: reply ? 0 : 1, stdout: reply ? `${CLAUDE}\n` : '', stderr: '' }
      runs.push([file, ...args])
      return reply ?? { exitCode: 127, stdout: '', stderr: '' }
    },
    isExecutable: async (path) => reply !== undefined && path === CLAUDE,
    openTerminal: async () => {},
    sleep: async () => {},
    loginEnv: async () => ({}),
    query() {
      throw new Error('No Turns in these tests')
    },
  }
  return { system, runs }
}

describe('Claude Code names a new Document', () => {
  test("asks the user's own claude once, on haiku, with no tools, settings or saved session", async () => {
    const { system, runs } = pretendMac({ exitCode: 0, stdout: 'bakery-sales-dashboard\n', stderr: '' })

    const name = await createClaudeCodeProvider(system).nameDocument('let us write a dashboard for my bakery sales')

    expect(name).toBe('bakery-sales-dashboard')
    expect(runs).toHaveLength(1)
    const [file, ...args] = runs[0] ?? []
    expect(file).toBe(CLAUDE)
    expect(args[0]).toBe('-p')
    expect(args[1]).toContain('"""let us write a dashboard for my bakery sales"""')
    expect(args.slice(2).join(' ')).toBe(
      '--model haiku --tools  --setting-sources  --strict-mcp-config --disable-slash-commands --no-session-persistence --output-format text',
    )
  })

  test('says nothing when claude fails or is missing', async () => {
    expect(await createClaudeCodeProvider(pretendMac({ exitCode: 1, stdout: '', stderr: 'Not logged in' }).system).nameDocument('x')).toBeUndefined()
    expect(await createClaudeCodeProvider(pretendMac(undefined).system).nameDocument('x')).toBeUndefined()
  })
})
