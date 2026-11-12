import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { arch, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createFakeAgentProvider } from '../../src/main/agent/fake'
import { createHost, type Host } from '../../src/main/host'
import { exportVideo, type Frame, type VideoFrames } from '../../src/main/video/export'
import { encodeWav } from '../../src/main/voices/wav'
import { animationVideoFile } from '../../src/main/templates/animation-video'
import { mp4Tracks } from './mp4'

// The ffmpeg `build/ffmpeg.mjs` builds (postinstall). Skipped where it hasn't been built.
const ffmpeg = join(__dirname, '../../vendor/ffmpeg', arch(), 'ffmpeg')
const withFfmpeg = describe.skipIf(!existsSync(ffmpeg))

let dataDir: string
let projectDir: string
let host: Host

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'margen-data-'))
  projectDir = await mkdtemp(join(tmpdir(), 'margen-project-'))
})

afterEach(async () => {
  host?.dispose()
  await rm(dataDir, { recursive: true, force: true })
  await rm(projectDir, { recursive: true, force: true })
})

/** A pretend page: a solid colour per frame, captured at 2× (a Retina capture) to show the export keeps the frame size. */
function fakeFrames(length: number, size = { width: 320, height: 180 }, onFrame?: (time: number) => void) {
  const asked: number[] = []
  let closed = false
  const frames: VideoFrames = {
    length,
    size,
    async frame(time) {
      asked.push(time)
      onFrame?.(time)
      const width = size.width * 2
      const height = size.height * 2
      const data = new Uint8Array(width * height * 4)
      const shade = Math.round((time / Math.max(length, 1)) * 255)
      for (let i = 0; i < data.length; i += 4) data.set([shade, 64, 255 - shade, 255], i)
      return { width, height, data } satisfies Frame
    },
    close() {
      closed = true
    },
  }
  return { frames, asked, closed: () => closed }
}

async function launch(frames: VideoFrames, save: (defaultPath: string) => string | undefined = (path) => path) {
  await writeFile(join(projectDir, 'teaser.html'), animationVideoFile('16:9'))
  await writeFile(join(projectDir, 'page.html'), '<h1>Not a video</h1>')
  const defaults: string[] = []
  host = createHost({
    dataDir,
    agent: createFakeAgentProvider({}),
    video: { ffmpeg, frames: async () => frames },
    pickSaveFile: async (defaultPath) => (defaults.push(defaultPath), save(defaultPath)),
  })
  await host.call('projects.open', projectDir)
  return { defaults }
}

withFfmpeg('Exporting an Animation video', () => {
  test('saves an H.264 MP4 at the frame size with a frame per 30th of a second, asking where in the Project folder', async () => {
    const { frames, asked, closed } = fakeFrames(2)
    const { defaults } = await launch(frames)
    await host.call('document.open', 'teaser.html')
    const progress: { frame: number; frames: number }[] = []
    host.on('video.exportProgress', (p) => progress.push(p))

    const saved = await host.call('video.export')

    expect(defaults).toEqual([join(projectDir, 'teaser.mp4')])
    expect(saved).toBe(join(projectDir, 'teaser.mp4'))
    const [video, ...others] = mp4Tracks(await readFile(join(projectDir, 'teaser.mp4')))
    expect(others).toEqual([])
    expect(video).toMatchObject({ handler: 'vide', codec: 'avc1', samples: 60, width: 320, height: 180 })
    expect(video?.duration).toBeCloseTo(2, 2)
    expect(asked).toHaveLength(60)
    expect(asked[0]).toBe(0)
    expect(asked[1]).toBeCloseTo(1 / 30, 9)
    expect(asked[59]).toBeCloseTo(59 / 30, 9)
    expect(progress.at(-1)).toEqual({ frame: 60, frames: 60 })
    expect(closed()).toBe(true)
    expect(await readdir(projectDir)).toEqual(['page.html', 'teaser.html', 'teaser.mp4'])
  })

  test('a length that falls between frames still shows its last moment', async () => {
    const { frames } = fakeFrames(1.01)
    await launch(frames)
    await host.call('document.open', 'teaser.html')

    await host.call('video.export')

    const [video] = mp4Tracks(await readFile(join(projectDir, 'teaser.mp4')))
    expect(video?.samples).toBe(31)
  })

  test('cancelling stops the export and removes the partial file', async () => {
    let cancelled = false
    const { frames, closed } = fakeFrames(4, undefined, (time) => {
      if (time >= 0.5 && !cancelled) {
        cancelled = true
        void host.call('video.cancelExport')
      }
    })
    await launch(frames)
    await host.call('document.open', 'teaser.html')

    expect(await host.call('video.export')).toBeNull()

    expect(await readdir(projectDir)).toEqual(['page.html', 'teaser.html'])
    expect(closed()).toBe(true)
  })

  test('cancelling the Save dialog exports nothing', async () => {
    const { frames, asked } = fakeFrames(1)
    await launch(frames, () => undefined)
    await host.call('document.open', 'teaser.html')

    expect(await host.call('video.export')).toBeNull()

    expect(asked).toEqual([])
    expect(await readdir(projectDir)).toEqual(['page.html', 'teaser.html'])
  })

  test('a frame that can’t be captured fails the export and leaves nothing behind', async () => {
    const { frames, closed } = fakeFrames(2, undefined, (time) => {
      if (time >= 1) throw new Error('The Document view went away')
    })
    await launch(frames)
    await host.call('document.open', 'teaser.html')

    await expect(host.call('video.export')).rejects.toThrow('The Document view went away')

    expect(await readdir(projectDir)).toEqual(['page.html', 'teaser.html'])
    expect(closed()).toBe(true)
  })

  test('only an Animation video exports', async () => {
    const { frames } = fakeFrames(1)
    await launch(frames)
    await host.call('document.open', 'page.html')

    await expect(host.call('video.export')).rejects.toThrow(/Animation video/)
  })
})

withFfmpeg('An audio track in the export (the narration, ticket 05)', () => {
  /** A tone `seconds` long, as a Voice's WAV. */
  async function tone(seconds: number) {
    const rate = 24_000
    const samples = Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / rate))
    const file = join(dataDir, `tone-${seconds}.wav`)
    await writeFile(file, encodeWav(samples, rate))
    return file
  }

  test.each([
    ['shorter than the video is padded with silence', 1.2],
    ['longer than the video is cut', 3.5],
  ])('a track %s to the video’s length', async (_, seconds) => {
    const output = join(projectDir, 'narrated.mp4')

    await exportVideo({ ffmpeg, frames: fakeFrames(2).frames, output, audio: await tone(seconds) })

    const tracks = mp4Tracks(await readFile(output))
    expect(tracks.map((t) => [t.handler, t.codec])).toEqual([
      ['vide', 'avc1'],
      ['soun', 'mp4a'],
    ])
    expect(tracks[0]?.samples).toBe(60)
    expect(tracks[1]?.duration).toBeCloseTo(2, 1)
  })
})
