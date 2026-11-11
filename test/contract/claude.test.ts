import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
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

test.skipIf(!enabled)(
  'a read-only shell command asks before it runs, and a denied one does not run',
  async () => {
    await writeFile(join(projectDir, 'index.html'), '<!doctype html>\n<h1>Hello</h1>\n')
    const provider = createClaudeCodeProvider(createNodeSystem(process.env))
    const session = provider.startSession({ projectDir, model: process.env.MARGEN_CLAUDE_MODEL ?? 'haiku', effort: 'low' })
    const seen: AgentEvent[] = []
    session.send({
      text: 'Run the shell command `ls` with the Bash tool, exactly once. If it is denied, reply with the single word: denied.',
      annotations: [],
    })
    for await (const event of session.events) {
      seen.push(event)
      if (event.type === 'approval-request') session.answerApproval(event.id, 'deny')
      if (event.type === 'turn-end') break
    }
    session.close()

    expect(seen.at(-1)).toEqual({ type: 'turn-end', reason: 'done' })
    expect(seen).toContainEqual(expect.objectContaining({ type: 'approval-request', kind: 'shell', detail: expect.stringMatching(/^ls\b/) }))
    expect(seen).not.toContainEqual(expect.objectContaining({ type: 'tool', tool: 'shell', status: 'done' }))
  },
  120_000,
)

/** A small PNG of one colour, as a data URL: a stand-in for a drawing's screenshot. */
function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): string {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), body.length + 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())])
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))])
  return `data:image/png;base64,${png.toString('base64')}`
}

test.skipIf(!enabled)(
  "a drawing's screenshots reach claude as images, and reading them back shows no tool card",
  async () => {
    await writeFile(join(projectDir, 'index.html'), '<!doctype html>\n<h1>Hello</h1>\n')
    const provider = createClaudeCodeProvider(createNodeSystem(process.env))
    const session = provider.startSession({ projectDir, document: 'index.html', model: process.env.MARGEN_CLAUDE_MODEL ?? 'haiku', effort: 'low' })
    const seen: AgentEvent[] = []
    session.send({
      text: 'Do not edit anything. Look at the attached images and reply with one word: the colour of the first image.',
      annotations: [
        {
          kind: 'draw',
          number: 1,
          comment: 'What colour is this?',
          viewportWidth: 800,
          strokes: [[{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 40 }]],
          boundingBox: { x: 10, y: 10, width: 50, height: 30 },
          targets: [],
          screenshot: solidPng(64, 40, [220, 20, 20]),
          crop: solidPng(32, 20, [255, 255, 255]),
        },
      ],
    })
    for await (const event of session.events) {
      seen.push(event)
      if (event.type === 'approval-request') session.answerApproval(event.id, 'deny')
      if (event.type === 'turn-end') break
    }
    session.close()

    expect(seen.at(-1)).toEqual({ type: 'turn-end', reason: 'done' })
    const reply = seen.flatMap((event) => (event.type === 'text' ? [event.text] : [])).join('')
    expect(reply.toLowerCase()).toContain('red')
    // Every tool card is about the Project's files, never claude's own temp copies of the images.
    expect(seen.filter((event) => event.type === 'approval-request')).toEqual([])
    expect(seen.filter((event) => event.type === 'tool' && event.tool === 'read' && !event.file.startsWith('index'))).toEqual([])
  },
  120_000,
)
