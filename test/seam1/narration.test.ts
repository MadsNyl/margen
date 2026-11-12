import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { arch, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createFakeAgentProvider, type FakeAgentProvider, type FakeAgentScript } from '../../src/main/agent/fake'
import { createHost, type Host } from '../../src/main/host'
import { animationVideoFile } from '../../src/main/templates/animation-video'
import type { Frame, VideoFrames } from '../../src/main/video/export'
import type { VoicePackEntry } from '../../src/main/voices/catalogue'
import { VIDEOTOOLBOX_H264 } from '../../src/main/video/videotoolbox'
import { createFakeSynthesiser } from '../../src/main/voices/fake'
import { mp4Tracks } from './mp4'

// Narration on an Animation video: its Voice marker, its lines spoken with that
// Voice and cached in the data directory, the narration in the export, and the
// Agent's line-length tool. The fake synthesiser speaks a tenth of a second per word.

const ffmpeg = join(__dirname, '../../vendor/ffmpeg', arch(), 'ffmpeg')
const withFfmpeg = describe.skipIf(!existsSync(ffmpeg))

let dataDir: string
let projectDir: string
let host: Host
let agent: FakeAgentProvider
let synthesiser: ReturnType<typeof createFakeSynthesiser>

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'margen-data-'))
  projectDir = await mkdtemp(join(tmpdir(), 'margen-project-'))
})

afterEach(async () => {
  host?.dispose()
  await rm(dataDir, { recursive: true, force: true })
  await rm(projectDir, { recursive: true, force: true })
})

function pack(id: string, voice: string): VoicePackEntry {
  return {
    id,
    name: id,
    engine: 'piper',
    licence: 'MIT engine · CC0 voice',
    url: 'http://127.0.0.1:1/unused',
    size: 1,
    sha256: '0',
    folder: id,
    files: { model: 'test.onnx', tokens: 'tokens.txt' },
    voices: [{ id: voice, name: voice, language: 'Norwegian', speaker: 0, espeak: 'nb', sample: 'Hei.' }],
  }
}

const CATALOGUE = [pack('piper-test', 'piper/test'), pack('piper-other', 'piper/other')]

/** A video narrated with `voice` (none: no marker). */
function video({ voice, narration }: { voice?: string; narration?: string } = {}) {
  let html = animationVideoFile('16:9')
  if (voice) html = html.replace('<title>', `<meta name="margen-voice" content="${voice}">\n<title>`)
  if (narration !== undefined) html = html.replace('</body>', `<script type="application/json" id="narration">${narration}</script>\n</body>`)
  return html
}

const LINES = JSON.stringify([
  { start: 0.5, text: 'Hello there.' },
  { start: 1, text: 'Three words here.' },
])

async function launch(opts: { files?: Record<string, string>; script?: FakeAgentScript; frames?: VideoFrames } = {}) {
  const { frames } = opts
  // piper-test is on this Mac; piper-other isn't.
  await mkdir(join(dataDir, 'voices', 'piper-test'), { recursive: true })
  for (const [name, html] of Object.entries(opts.files ?? {})) await writeFile(join(projectDir, name), html)
  agent = createFakeAgentProvider(opts.script)
  synthesiser = createFakeSynthesiser()
  host = createHost({
    dataDir,
    agent,
    voices: { catalogue: CATALOGUE, synthesiser },
    ...(frames && { video: { ffmpeg, encoder: VIDEOTOOLBOX_H264, frames: async () => frames }, pickSaveFile: async (path) => path }),
  })
  await host.call('projects.open', projectDir)
}

function turnEnded() {
  return new Promise<void>((resolve) => {
    const off = host.on('session.entry', ({ entry }) => entry.type === 'turn-end' && (off(), resolve()))
  })
}

describe('The narration of the open video', () => {
  test('is its Voice and its lines, as the file has them', async () => {
    await launch({ files: { 'teaser.html': video({ voice: 'piper/test', narration: LINES }) } })
    await host.call('document.open', 'teaser.html')

    expect(await host.call('video.narration')).toEqual({
      voice: 'piper/test',
      lines: [
        { start: 0.5, text: 'Hello there.' },
        { start: 1, text: 'Three words here.' },
      ],
    })
  })

  test('reports a narration block that is not valid JSON, and has no lines', async () => {
    await launch({ files: { 'teaser.html': video({ narration: '[{ "start": 1 ' }) } })
    await host.call('document.open', 'teaser.html')

    const narration = await host.call('video.narration')
    expect(narration.voice).toBeUndefined()
    expect(narration.lines).toEqual([])
    expect(narration.problem).toMatch(/isn’t valid JSON/)
  })
})

describe('Choosing the Voice', () => {
  test('writes it into the file as the margen-voice marker, after a Checkpoint; no Voice removes it', async () => {
    await launch({ files: { 'teaser.html': video() } })
    await host.call('document.open', 'teaser.html')
    const file = join(projectDir, 'teaser.html')

    await host.call('video.setVoice', 'piper/other')
    expect(await readFile(file, 'utf8')).toContain('<meta name="margen-template" content="animation-video">\n<meta name="margen-voice" content="piper/other">\n')
    expect((await host.call('video.narration')).voice).toBe('piper/other')
    expect((await host.call('checkpoints.list')).map((c) => [c.reason, c.text])).toEqual([['edit', 'Voice → piper/other']])

    await host.call('video.setVoice', null)
    expect(await readFile(file, 'utf8')).toBe(video())
  })

  test('only takes a Voice Margen knows, on an Animation video', async () => {
    await launch({ files: { 'teaser.html': video(), 'page.html': '<h1>Not a video</h1>' } })
    await host.call('document.open', 'teaser.html')
    await expect(host.call('video.setVoice', 'piper/nobody')).rejects.toThrow(/Not a Voice/)
    await host.call('document.open', 'page.html')
    await expect(host.call('video.setVoice', 'piper/test')).rejects.toThrow(/Animation video/)
    expect(await readFile(join(projectDir, 'page.html'), 'utf8')).toBe('<h1>Not a video</h1>')
  })
})

describe('Speaking a line', () => {
  test('speaks it with the Voice once, then plays it from the data directory, also after a restart', async () => {
    await launch()
    const first = await host.call('video.speakLine', 'piper/test', 'Three words here.')
    const again = await host.call('video.speakLine', 'piper/test', 'Three words here.')

    expect(first.duration).toBeCloseTo(0.3, 5)
    expect(again).toEqual(first)
    expect(synthesiser.spoken.map((r) => r.text)).toEqual(['Three words here.'])
    expect(await readdir(join(dataDir, 'narration'))).toHaveLength(1)

    host.dispose()
    await launch()
    expect(await host.call('video.speakLine', 'piper/test', 'Three words here.')).toEqual(first)
    expect(synthesiser.spoken).toEqual([])
  })

  test('speaks each new text, and rejects a Voice not on this Mac', async () => {
    await launch()
    await host.call('video.speakLine', 'piper/test', 'Hello.')
    await expect(host.call('video.speakLine', 'piper/other', 'Hello.')).rejects.toThrow(/not on this Mac/)
    await host.call('video.speakLine', 'piper/test', 'Hello again.')
    expect(synthesiser.spoken.map((r) => r.text)).toEqual(['Hello.', 'Hello again.'])
  })
})

describe('The line-length tool', () => {
  test('a Session on an Animation video gets Margen’s tools, and the Agent hears each line’s spoken length with the video’s Voice', async () => {
    await launch({
      files: { 'teaser.html': video({ voice: 'piper/test', narration: LINES }) },
      script: {
        turns: [
          [
            { type: 'call', tool: 'narration_lengths', input: {} },
            { type: 'call', tool: 'narration_lengths', input: { texts: ['One two three four five.'] } },
          ],
        ],
      },
    })
    await host.call('document.open', 'teaser.html')
    const ended = turnEnded()
    await host.call('session.send', { text: 'Time the narration', annotations: [] })
    await ended

    expect(agent.sessions[0]?.tools?.map((t) => t.name)).toEqual(['narration_lengths'])
    expect(agent.sessions[0]?.instructions).toMatch(/narration_lengths/)
    const [lines, drafts] = agent.toolCalls.map((call) => JSON.parse(call.result.text) as unknown)
    expect(lines).toEqual({
      voice: 'piper/test',
      lines: [
        { start: 0.5, text: 'Hello there.', seconds: 0.2, end: 0.7 },
        { start: 1, text: 'Three words here.', seconds: 0.3, end: 1.3 },
      ],
    })
    expect(drafts).toEqual({ voice: 'piper/test', lines: [{ text: 'One two three four five.', seconds: 0.5 }] })
    const session = await host.call('session.current')
    expect(session?.entries).toContainEqual({ type: 'tool', id: 'call-1', status: 'done', tool: 'other', name: 'narration_lengths', detail: '' })
  })

  test('says which lines overlap the next, and what is wrong when it can’t measure', async () => {
    const overlapping = JSON.stringify([
      { start: 0, text: 'One two three four.' },
      { start: 0.2, text: 'Too soon.' },
    ])
    await launch({
      files: { 'a.html': video({ voice: 'piper/test', narration: overlapping }), 'b.html': video({ narration: LINES }), 'c.html': video({ voice: 'piper/other', narration: LINES }) },
      script: { turns: [[{ type: 'call', tool: 'narration_lengths', input: {} }], [{ type: 'call', tool: 'narration_lengths', input: {} }], [{ type: 'call', tool: 'narration_lengths', input: {} }]] },
    })
    for (const name of ['a.html', 'b.html', 'c.html']) {
      await host.call('document.open', name)
      const ended = turnEnded()
      await host.call('session.send', { text: 'Time it', annotations: [] })
      await ended
    }

    const [a, b, c] = agent.toolCalls.map((call) => call.result)
    expect(JSON.parse(a?.text ?? '')).toMatchObject({ overlaps: ['Line 1 ends at 0.4 s, after line 2 starts at 0.2 s.'] })
    expect(b).toEqual({ text: expect.stringMatching(/no Voice/), error: true })
    expect(c).toEqual({ text: expect.stringMatching(/not on this Mac/), error: true })
  })

  test('a Blank Document’s Session gets no tools', async () => {
    await launch({ files: { 'page.html': '<h1>Hi</h1>' } })
    await host.call('document.open', 'page.html')
    const ended = turnEnded()
    await host.call('session.send', { text: 'Hi', annotations: [] })
    await ended
    expect(agent.sessions[0]).not.toHaveProperty('tools')
  })
})

/** A pretend page of one colour, for the export. */
function frames(length: number): VideoFrames {
  return {
    length,
    size: { width: 160, height: 90 },
    async frame() {
      return { width: 160, height: 90, data: new Uint8Array(160 * 90 * 4).fill(200) } satisfies Frame
    },
    close() {},
  }
}

withFfmpeg('The narration in the export', () => {
  test('a narrated video exports with an audio track as long as the video', async () => {
    await launch({ files: { 'teaser.html': video({ voice: 'piper/test', narration: LINES }) }, frames: frames(2) })
    await host.call('document.open', 'teaser.html')

    const saved = await host.call('video.export')

    const tracks = mp4Tracks(await readFile(saved ?? ''))
    expect(tracks.map((t) => t.handler)).toEqual(['vide', 'soun'])
    expect(tracks[1]?.duration).toBeCloseTo(2, 1)
    expect(synthesiser.spoken.map((r) => r.text)).toEqual(['Hello there.', 'Three words here.'])
    // Nothing is left behind but the audio cache.
    expect(await readdir(join(dataDir, 'narration'))).toHaveLength(2)
  })

  test('narration that runs past the last animation makes the video that long, holding the last frame', async () => {
    // The last line starts at 1 s and takes 0.3 s with the fake Voice; the animations end at 1 s.
    await launch({ files: { 'teaser.html': video({ voice: 'piper/test', narration: LINES }) }, frames: frames(1) })
    await host.call('document.open', 'teaser.html')

    const saved = await host.call('video.export')

    const [picture, sound] = mp4Tracks(await readFile(saved ?? ''))
    expect(picture?.samples).toBe(39)
    expect(sound?.duration).toBeCloseTo(1.3, 1)
  })

  test('a video with no Voice or no lines exports silent', async () => {
    await launch({ files: { 'a.html': video({ narration: LINES }), 'b.html': video({ voice: 'piper/test' }) }, frames: frames(1) })
    for (const name of ['a.html', 'b.html']) {
      await host.call('document.open', name)
      const saved = await host.call('video.export')
      expect(mp4Tracks(await readFile(saved ?? '')).map((t) => t.handler)).toEqual(['vide'])
    }
  })

  test('a Voice not on this Mac stops the export before it starts', async () => {
    await launch({ files: { 'teaser.html': video({ voice: 'piper/other', narration: LINES }) }, frames: frames(1) })
    await host.call('document.open', 'teaser.html')
    await expect(host.call('video.export')).rejects.toThrow(/not on this Mac/)
    expect(existsSync(join(projectDir, 'teaser.mp4'))).toBe(false)
  })
})
