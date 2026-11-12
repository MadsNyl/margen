import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createHost, type Host } from '../../src/main/host'
import { createFakeAgentProvider, type FakeAgentProvider, type FakeAgentScript } from '../../src/main/agent/fake'

let dataDir: string
let projectDir: string
let host: Host
let agent: FakeAgentProvider

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'margen-data-'))
  projectDir = await mkdtemp(join(tmpdir(), 'margen-project-'))
})

afterEach(async () => {
  host?.dispose()
  await rm(dataDir, { recursive: true, force: true })
  await rm(projectDir, { recursive: true, force: true })
})

async function launch(script: FakeAgentScript = {}) {
  agent = createFakeAgentProvider(script)
  host = createHost({ dataDir, agent })
  await host.call('projects.open', projectDir)
}

/** Resolves once the open Document's next Turn has ended. */
function turnEnded() {
  return new Promise<void>((resolve) => {
    const off = host.on('session.entry', ({ entry }) => entry.type === 'turn-end' && (off(), resolve()))
  })
}

describe('Templates', () => {
  test('a Document from Animation video starts as the marked stage at the chosen frame size, and its Session gets the rules', async () => {
    await launch({ documentName: 'launch-teaser' })
    const ended = turnEnded()

    const opened = await host.call('project.newDocument', 'A teaser for our launch', [], { template: 'animation-video', frame: '9:16' })
    await ended

    expect(opened).toMatchObject({ path: 'launch-teaser.html', template: 'animation-video' })
    const html = await readFile(join(projectDir, 'launch-teaser.html'), 'utf8')
    expect(html).toContain('<meta name="margen-template" content="animation-video">')
    expect(html).toMatch(/width: 1080px;\s*height: 1920px/)
    expect(html.match(/<section/g)).toHaveLength(1)
    expect(agent.sent).toEqual([{ text: 'A teaser for our launch', annotations: [] }])
    const instructions = agent.sessions[0]?.instructions ?? ''
    expect(instructions).toMatch(/CSS animations/)
    expect(instructions).toMatch(/id="narration"/)
  })
  test('an Animation video without a frame size (the `@` chip) is 16:9', async () => {
    await launch({ documentName: 'intro' })
    const ended = turnEnded()

    await host.call('project.newDocument', 'An intro, square if you can', [], { template: 'animation-video' })
    await ended

    expect(await readFile(join(projectDir, 'intro.html'), 'utf8')).toMatch(/width: 1920px;\s*height: 1080px/)
  })

  test('the rules let the Agent change the Frame size to one of the four when the user asks, and keep it otherwise', async () => {
    await launch({ documentName: 'intro' })
    const ended = turnEnded()

    await host.call('project.newDocument', 'An intro, in 9:16 for stories', [], { template: 'animation-video' })
    await ended

    const instructions = agent.sessions[0]?.instructions ?? ''
    for (const size of ['16:9 (1920 × 1080 px)', '9:16 (1080 × 1920 px)', '1:1 (1080 × 1080 px)', '4:5 (1080 × 1350 px)']) {
      expect(instructions).toContain(size)
    }
    expect(instructions).toMatch(/only when the user asks/i)
    expect(instructions).not.toMatch(/keeps the width and height it has in the file/)
  })

  test('a Blank Document starts empty, unmarked, and its Session gets no Template instructions', async () => {
    await launch({ documentName: 'poster' })
    const ended = turnEnded()

    const opened = await host.call('project.newDocument', 'A poster', [], { template: 'blank' })
    await ended

    expect(opened).not.toHaveProperty('template')
    expect(await readFile(join(projectDir, 'poster.html'), 'utf8')).toBe('')
    expect(agent.sessions[0]).not.toHaveProperty('instructions')
  })

  test('a marked file opened from the Project gets the rules too, in every new Session on it', async () => {
    await writeFile(
      join(projectDir, 'cloned.html'),
      `<!doctype html><html><head><meta name='margen-template' content='animation-video'></head><body></body></html>`,
    )
    await writeFile(join(projectDir, 'plain.html'), '<h1>Plain</h1>')
    await launch()

    expect(await host.call('document.open', 'cloned.html')).toMatchObject({ template: 'animation-video' })
    let ended = turnEnded()
    await host.call('session.send', { text: 'Make it longer', annotations: [] })
    await ended
    await host.call('session.new')
    ended = turnEnded()
    await host.call('session.send', { text: 'And slower', annotations: [] })
    await ended
    await host.call('document.open', 'plain.html')
    ended = turnEnded()
    await host.call('session.send', { text: 'Hi', annotations: [] })
    await ended

    expect(agent.sessions.map((session) => [session.document, session.instructions?.includes('CSS animations')])).toEqual([
      ['cloned.html', true],
      ['cloned.html', true],
      ['plain.html', undefined],
    ])
  })

  test('a Session whose Document can’t be read for its marker says so and fails the Turn, instead of starting without the rules', async () => {
    await writeFile(join(projectDir, 'locked.html'), `<!doctype html><html><head><meta name="margen-template" content="animation-video"></head></html>`)
    await launch()
    await host.call('document.open', 'locked.html')
    await chmod(join(projectDir, 'locked.html'), 0o000)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ended = turnEnded()

    await host.call('session.send', { text: 'Make it longer', annotations: [] })
    await ended

    const entries = (await host.call('session.current'))?.entries ?? []
    expect(entries.map((entry) => entry.type)).toEqual(['user', 'error', 'turn-end'])
    expect(entries[1]).toMatchObject({ type: 'error', message: expect.stringMatching(/Animation video|Template/) })
    expect(entries[2]).toEqual({ type: 'turn-end', reason: 'failed' })
    expect(agent.sessions).toEqual([])
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()

    // Once it can be read again, the next Turn starts the Session with the rules.
    await chmod(join(projectDir, 'locked.html'), 0o644)
    const again = turnEnded()
    await host.call('session.send', { text: 'Try again', annotations: [] })
    await again
    expect(agent.sessions.map((session) => session.instructions?.includes('CSS animations'))).toEqual([true])
  })

  test('a Template the host API is given must be a real one', async () => {
    await launch()
    await expect(host.call('project.newDocument', 'x', [], { template: 'slideshow' } as never)).rejects.toThrow(/Not a Template/)
  })
})
