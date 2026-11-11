import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { AgentEvent } from '../../src/shared/agent'
import type { HostEvents, SessionEntry } from '../../src/shared/host-api'
import { createHost, type Host } from '../../src/main/host'
import { createFakeAgentProvider, type FakeAgentProvider, type FakeAgentScript } from '../../src/main/agent/fake'
import type { ToolRequest } from '../../src/main/permissions'

// The permission presets, through the host: the fake Agent asks the policy the
// host gave it about each scripted tool request, as the Claude adapter does,
// and only an "ask" reaches the chat as an approval-request.

let dataDir: string
let projectDir: string
let outsideDir: string
let host: Host | undefined
let agent: FakeAgentProvider

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'margen-data-'))
  // Under /tmp, which macOS resolves to /private/tmp, as `claude` reports it.
  projectDir = await mkdtemp('/tmp/margen-project-')
  outsideDir = await mkdtemp(join(tmpdir(), 'margen-outside-'))
  await writeFile(join(projectDir, 'index.html'), '<h1>Hi</h1>')
})

afterEach(async () => {
  host?.dispose()
  host = undefined
  for (const dir of [dataDir, projectDir, outsideDir]) await rm(dir, { recursive: true, force: true })
})

async function editor(script: FakeAgentScript) {
  agent = createFakeAgentProvider(script)
  host = createHost({ dataDir, agent })
  await host.call('projects.open', projectDir)
  await host.call('document.open', 'index.html')
  return host
}

/** Runs one Turn and returns its events. Approval requests are answered with `answer`. */
async function turn(h: Host, answer: 'allow-once' | 'deny' = 'deny'): Promise<HostEvents['session.entry'][]> {
  const seen: HostEvents['session.entry'][] = []
  const ended = new Promise<void>((resolve) => {
    h.on('session.entry', (payload) => {
      seen.push(payload)
      if (payload.entry.type === 'approval-request') void h.call('session.answerApproval', payload.entry.id, answer)
      if (payload.entry.type === 'turn-end') resolve()
    })
  })
  await h.call('session.send', { text: 'Go', annotations: [] })
  await ended
  return seen
}

/** The approval-request the request raises, or `undefined` when the policy lets it through. */
async function approvalFor(request: ToolRequest): Promise<AgentEvent | undefined> {
  const h = await editor({ turns: [[{ type: 'permission', id: 'p1', request }]] })
  const seen = await turn(h)
  return seen.map(({ entry }) => entry).find((entry) => entry.type === 'approval-request')
}

describe('the Editor preset', () => {
  test('reads anywhere in the Project and writes inside it go ahead without asking', async () => {
    expect(await approvalFor({ kind: 'read', path: join(projectDir, 'index.html') })).toBeUndefined()
    expect(await approvalFor({ kind: 'read', path: projectDir })).toBeUndefined()
    expect(await approvalFor({ kind: 'write', path: join(projectDir, 'pages', 'new', 'about.html') })).toBeUndefined()
    expect(await approvalFor({ kind: 'write', path: 'styles.css' })).toBeUndefined()
    expect(await approvalFor({ kind: 'write', path: join(projectDir, '..notes.html') })).toBeUndefined()
  })

  test('paths are compared with symlinks resolved: /private/tmp is the same Project as /tmp', async () => {
    const real = await realpath(projectDir)
    expect(real).not.toBe(projectDir)
    expect(await approvalFor({ kind: 'write', path: join(real, 'index.html') })).toBeUndefined()
  })

  test('web search and fetch go ahead without asking', async () => {
    expect(await approvalFor({ kind: 'web' })).toBeUndefined()
  })

  test('a path outside the Project asks first', async () => {
    expect(await approvalFor({ kind: 'read', path: '/etc/hosts', tool: 'Read' })).toEqual({
      type: 'approval-request',
      id: 'p1',
      kind: 'outside-project',
      detail: 'Read /etc/hosts',
    })
    expect(await approvalFor({ kind: 'write', path: join(outsideDir, 'x.html') })).toMatchObject({ kind: 'outside-project' })
  })

  test('.. escapes out of the Project ask first', async () => {
    expect(await approvalFor({ kind: 'write', path: join(projectDir, '..', 'escape.html') })).toMatchObject({ kind: 'outside-project' })
    expect(await approvalFor({ kind: 'write', path: '../escape.html' })).toMatchObject({ kind: 'outside-project' })
    expect(await approvalFor({ kind: 'read', path: `${projectDir}/pages/../../etc` })).toMatchObject({ kind: 'outside-project' })
  })

  test('a symlink inside the Project that points outside it asks first', async () => {
    await symlink(outsideDir, join(projectDir, 'linked'))
    await writeFile(join(outsideDir, 'secret.txt'), 'x')
    await mkdir(join(projectDir, 'pages'))

    expect(await approvalFor({ kind: 'read', path: join(projectDir, 'linked', 'secret.txt') })).toMatchObject({ kind: 'outside-project' })
    expect(await approvalFor({ kind: 'write', path: join(projectDir, 'linked', 'new.html') })).toMatchObject({ kind: 'outside-project' })
  })

  test('every shell command asks first, even a read-only one', async () => {
    expect(await approvalFor({ kind: 'shell', command: 'ls' })).toEqual({ type: 'approval-request', id: 'p1', kind: 'shell', detail: 'ls' })
    expect(await approvalFor({ kind: 'shell', command: `cat ${projectDir}/index.html` })).toMatchObject({ kind: 'shell' })
  })

  test('any other tool asks first, by name', async () => {
    expect(await approvalFor({ kind: 'other', name: 'mcp__figma__export' })).toEqual({
      type: 'approval-request',
      id: 'p1',
      kind: 'other',
      detail: 'mcp__figma__export',
    })
  })
})

describe('the preset', () => {
  test('is the Editor preset to begin with', async () => {
    const h = await editor({})
    expect(await h.call('permissions.preset')).toBe('editor')
  })

  test('Allow everything skips every approval', async () => {
    const requests: ToolRequest[] = [
      { kind: 'shell', command: 'rm -rf build' },
      { kind: 'write', path: '/etc/hosts' },
      { kind: 'read', path: join(projectDir, '..', 'other') },
      { kind: 'other', name: 'mcp__figma__export' },
    ]
    const h = await editor({ turns: [requests.map((request, i) => ({ type: 'permission' as const, id: `p${i}`, request }))] })
    await h.call('permissions.setPreset', 'allow-everything')

    const seen = await turn(h)

    expect(seen.map(({ entry }) => entry.type)).toEqual(['user', 'turn-end'])
  })

  test('a change says so, persists, and applies from the next request, mid-Turn too', async () => {
    const h = await editor({
      turns: [
        [
          { type: 'permission', id: 'before', request: { kind: 'shell', command: 'ls' } },
          { type: 'permission', id: 'after', request: { kind: 'shell', command: 'ls' } },
        ],
      ],
    })
    const changed: HostEvents['permissions.changed'][] = []
    h.on('permissions.changed', (preset) => changed.push(preset))
    const seen: SessionEntry[] = []
    const ended = new Promise<void>((resolve) =>
      h.on('session.entry', ({ entry }) => {
        seen.push(entry)
        if (entry.type === 'approval-request') {
          void h.call('permissions.setPreset', 'allow-everything').then(() => h.call('session.answerApproval', entry.id, 'allow-once'))
        }
        if (entry.type === 'turn-end') resolve()
      }),
    )

    await h.call('session.send', { text: 'Go', annotations: [] })
    await ended

    expect(seen.filter((entry) => entry.type === 'approval-request').map((entry) => 'id' in entry && entry.id)).toEqual(['before'])
    expect(changed).toEqual(['allow-everything'])
    h.dispose()

    host = createHost({ dataDir, agent: createFakeAgentProvider() })
    expect(await host.call('permissions.preset')).toBe('allow-everything')
    await host.call('permissions.setPreset', 'editor')
    expect(await host.call('permissions.preset')).toBe('editor')
  })
})

describe('approvals', () => {
  test('the request reaches the chat, the answer reaches the Agent, and the Session keeps the answer', async () => {
    const h = await editor({
      turns: [
        [
          { type: 'permission', id: 'a1', request: { kind: 'shell', command: 'curl -o hero.jpg https://example.com/bread.jpg' } },
          { type: 'text', text: 'Downloaded.' },
        ],
      ],
    })

    const seen = await turn(h, 'allow-once')

    expect(agent.approvals).toEqual([{ id: 'a1', decision: 'allow-once' }])
    expect(seen.map(({ entry }) => entry)).toEqual([
      { type: 'user', turn: { text: 'Go', annotations: [] }, checkpoint: expect.any(String) },
      { type: 'approval-request', id: 'a1', kind: 'shell', detail: 'curl -o hero.jpg https://example.com/bread.jpg' },
      { type: 'approval-answer', id: 'a1', decision: 'allow-once' },
      { type: 'text', text: 'Downloaded.' },
      { type: 'turn-end', reason: 'done' },
    ])
    expect((await h.call('session.current'))?.entries).toEqual(seen.map(({ entry }) => entry))
  })

  test('a request is answered once; later answers and unknown ids are ignored', async () => {
    const h = await editor({ turns: [[{ type: 'permission', id: 'a1', request: { kind: 'shell', command: 'ls' } }]] })
    const seen = await turn(h, 'deny')

    await h.call('session.answerApproval', 'a1', 'allow-once')
    await h.call('session.answerApproval', 'nope', 'allow-once')

    expect(agent.approvals).toEqual([{ id: 'a1', decision: 'deny' }])
    expect((await h.call('session.current'))?.entries.filter((entry) => entry.type === 'approval-answer')).toEqual([
      { type: 'approval-answer', id: 'a1', decision: 'deny' },
    ])
    expect(seen.map(({ entry }) => entry.type)).toEqual(['user', 'approval-request', 'approval-answer', 'turn-end'])
  })

  test('switching to Allow everything allows the request that is waiting', async () => {
    const h = await editor({ turns: [[{ type: 'permission', id: 'a1', request: { kind: 'shell', command: 'ls' } }]] })
    const seen: SessionEntry[] = []
    const ended = new Promise<void>((resolve) =>
      h.on('session.entry', ({ entry }) => {
        seen.push(entry)
        if (entry.type === 'approval-request') void h.call('permissions.setPreset', 'allow-everything')
        if (entry.type === 'turn-end') resolve()
      }),
    )

    await h.call('session.send', { text: 'Go', annotations: [] })
    await ended

    expect(agent.approvals).toEqual([{ id: 'a1', decision: 'allow-once' }])
    expect(seen.map((entry) => entry.type)).toEqual(['user', 'approval-request', 'approval-answer', 'turn-end'])
  })
})
