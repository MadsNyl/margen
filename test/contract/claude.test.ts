import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { AgentEvent } from '../../src/shared/agent'
import { createClaudeCodeProvider } from '../../src/main/agent/claude'
import { createNodeSystem } from '../../src/main/agent/claude/node-system'

// The contract test: one tiny Turn against the real `claude` installed on this
// machine, signed in with your own login. It costs a little usage, so it only
// runs when asked:  MARGEN_CLAUDE_CONTRACT=1 pnpm vitest run test/contract
// MARGEN_CLAUDE_MODEL picks the model (default haiku).

const enabled = process.env.MARGEN_CLAUDE_CONTRACT === '1'

let projectDir: string

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'margen-contract-'))
})

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true })
})

test.skipIf(!enabled)(
  'a Turn with the real claude edits the Document and streams the events Margen maps',
  async () => {
    await writeFile(join(projectDir, 'index.html'), '<!doctype html>\n<h1>Hello</h1>\n')
    const provider = createClaudeCodeProvider(createNodeSystem(process.env))
    expect(await provider.detect()).toMatchObject({ installed: true, signedIn: true })

    const session = provider.startSession({ projectDir, model: process.env.MARGEN_CLAUDE_MODEL ?? 'haiku', effort: 'low' })
    const seen: AgentEvent[] = []
    session.send({
      text: 'In index.html, change the h1 text from Hello to Goodbye using the Edit tool. Then reply with the single word: done.',
      annotations: [],
    })
    for await (const event of session.events) {
      seen.push(event)
      if (event.type === 'turn-end') break
    }
    session.close()

    expect(seen.at(-1)).toEqual({ type: 'turn-end', reason: 'done' })
    expect(seen).toContainEqual(
      expect.objectContaining({ type: 'tool', tool: 'edit', file: 'index.html', status: 'done', added: 1, removed: 1 }),
    )
    expect(seen.filter((event) => event.type === 'text').length).toBeGreaterThan(0)
    expect(await readFile(join(projectDir, 'index.html'), 'utf8')).toContain('<h1>Goodbye</h1>')
  },
  120_000,
)
