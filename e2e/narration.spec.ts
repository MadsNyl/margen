import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { VoicePackEntry } from '../src/main/voices/catalogue'
import { launchApp, makeFolder, type LaunchedApp } from './app'

let launched: LaunchedApp | undefined
let folder: string | undefined
let server: Server | undefined

test.afterEach(async () => {
  await launched?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)))
  if (folder) await rm(folder, { recursive: true, force: true })
})

/** A Piper-shaped download, served locally as sherpa-onnx's releases would. */
async function serveVoice(): Promise<VoicePackEntry> {
  const work = await mkdtemp(join(tmpdir(), 'margen-archive-'))
  await mkdir(join(work, 'vits-piper-test'))
  await writeFile(join(work, 'vits-piper-test', 'test.onnx'), randomBytes(64 * 1024))
  await writeFile(join(work, 'vits-piper-test', 'tokens.txt'), 'a 1\n')
  execFileSync('tar', ['-cjf', join(work, 'test.tar.bz2'), '-C', work, 'vits-piper-test'])
  const archive = await readFile(join(work, 'test.tar.bz2'))
  await rm(work, { recursive: true, force: true })
  const listening = createServer((_request, response) => {
    response.writeHead(200, { 'content-length': archive.length })
    response.end(archive)
  })
  server = listening
  await new Promise<void>((resolve) => listening.listen(0, '127.0.0.1', resolve))
  return {
    id: 'piper-test',
    name: 'Testa, Norwegian',
    engine: 'piper',
    licence: 'MIT engine · CC0 voice',
    url: `http://127.0.0.1:${(listening.address() as AddressInfo).port}/test.tar.bz2`,
    size: archive.length,
    sha256: createHash('sha256').update(archive).digest('hex'),
    folder: 'vits-piper-test',
    files: { model: 'test.onnx', tokens: 'tokens.txt' },
    voices: [{ id: 'piper/test', name: 'Testa', language: 'Norwegian', speaker: 0, espeak: 'nb', sample: 'Hei.' }],
  }
}

const MARKER = '<meta name="margen-template" content="animation-video">'

/** A 2 s video with two narration lines, the last ending at 2.3 s: the fake Voice says each word in a tenth of a second. */
const VIDEO = `<!doctype html>
<html>
<head>
${MARKER}
<style>
  html, body { margin: 0; }
  .stage { position: relative; width: 640px; height: 360px; overflow: hidden; background: #fff; }
  .scene { position: absolute; inset: 0; visibility: hidden; animation: scene 2s linear 0s; }
  @keyframes scene { from, to { visibility: visible; } }
</style>
</head>
<body>
<main class="stage"><section class="scene"><h1>Hello</h1></section></main>
<script type="application/json" id="narration">[{ "start": 0.5, "text": "Hello there." }, { "start": 2, "text": "Three words here." }]</script>
</body>
</html>
`

/** Every narration line the editor starts, as Web Audio is asked to: in how long, from where, and the line's length. */
const RECORD_AUDIO = `(() => {
  window.started = []
  window.stopped = 0
  const { start, stop } = AudioBufferSourceNode.prototype
  AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, ...rest) {
    window.started.push({ delay: Math.max(0, when - this.context.currentTime), offset, length: Math.round(this.buffer.duration * 10) / 10 })
    return start.call(this, when, offset, ...rest)
  }
  AudioBufferSourceNode.prototype.stop = function (...args) {
    window.stopped++
    return stop.apply(this, args)
  }
})()`

type Started = { delay: number; offset: number; length: number }[]

test('choosing a Voice marks the video, offers its download, and the narration plays with the clock', async () => {
  folder = await makeFolder({ 'intro.html': VIDEO })
  launched = await launchApp({ pickFolder: folder, voices: [await serveVoice()] })
  const { window, spoken } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()
  await window.getByRole('list', { name: 'Documents' }).getByRole('button', { name: /^intro\.html/ }).click()
  await expect(window.getByRole('region', { name: 'Document view' })).toHaveAttribute('data-ready', 'true')

  const timer = window.getByRole('timer', { name: 'Time' })
  await expect(timer).toHaveText('0:00.0 / 0:02.0')
  const voice = window.getByRole('button', { name: 'Voice' })
  await expect(voice).toHaveText('No voice')
  await voice.click()
  await window.getByRole('menu').getByRole('menuitem', { name: /Testa/ }).click()
  await expect(voice).toHaveText('Testa')
  await expect.poll(() => readFile(join(folder ?? '', 'intro.html'), 'utf8')).toContain(`${MARKER}\n<meta name="margen-voice" content="piper/test">`)

  // Not on this Mac yet: the time bar offers it.
  await window.getByRole('button', { name: 'Download Testa' }).click()
  await expect(window.getByRole('button', { name: 'Download Testa' })).toBeHidden()
  // Spoken ahead of playing, so it starts on time.
  // In any order: the lines are spoken side by side.
  await expect.poll(async () => (await spoken()).map((line) => line.text).sort()).toEqual(['Hello there.', 'Three words here.'])
  // The narration runs past the last animation, and so does the video.
  await expect(timer).toHaveText('0:00.0 / 0:02.3')

  await window.evaluate(RECORD_AUDIO)
  await window.getByRole('button', { name: 'Play' }).click()
  await expect.poll(() => window.evaluate(() => (window as unknown as { started: Started }).started.length)).toBe(2)
  const [first, second] = await window.evaluate(() => (window as unknown as { started: Started }).started)
  expect(first).toMatchObject({ offset: 0, length: 0.2 })
  expect(first?.delay).toBeGreaterThan(0.25)
  expect(first?.delay).toBeLessThanOrEqual(0.5)
  expect(second).toMatchObject({ offset: 0, length: 0.3 })
  expect((second?.delay ?? 0) - (first?.delay ?? 0)).toBeCloseTo(1.5, 1)

  // Paused after the first line: both stop, and playing again starts only the second, as long from now as the clock is from it.
  await expect(timer).toHaveText(/^0:0(0\.[89]|1\.[0-4])/)
  await window.getByRole('button', { name: 'Pause' }).click()
  await expect.poll(() => window.evaluate(() => (window as unknown as { stopped: number }).stopped)).toBeGreaterThanOrEqual(2)
  const paused = Number((await timer.textContent())?.match(/^0:(\d\d\.\d)/)?.[1])
  await window.evaluate(() => ((window as unknown as { started: Started }).started = []))
  await window.getByRole('button', { name: 'Play' }).click()
  await expect.poll(() => window.evaluate(() => (window as unknown as { started: Started }).started.length)).toBe(1)
  const [again] = await window.evaluate(() => (window as unknown as { started: Started }).started)
  expect(again).toMatchObject({ offset: 0, length: 0.3 })
  expect(Math.abs((again?.delay ?? 0) - (2 - paused))).toBeLessThan(0.2)

  // Each line's start is a tick on the track.
  const track = window.getByRole('group', { name: 'Time bar' }).getByRole('slider', { name: 'Seek' })
  await expect(track.locator('[data-line-start]')).toHaveCount(2)

  // Dragging the track while it plays silences the narration; letting go plays on from there, lines and all.
  await window.getByRole('button', { name: 'Pause' }).click()
  await window.getByRole('button', { name: 'Play' }).click()
  await expect.poll(() => window.evaluate(() => (window as unknown as { started: Started }).started.length)).toBe(2)
  const box = (await track.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }
  const stoppedBefore = await window.evaluate(() => (window as unknown as { stopped: number }).stopped)
  await window.evaluate(() => ((window as unknown as { started: Started }).started = []))
  await window.mouse.move(box.x + 2, box.y + box.height / 2)
  await window.mouse.down()
  await expect.poll(() => window.evaluate(() => (window as unknown as { stopped: number }).stopped)).toBeGreaterThan(stoppedBefore)
  await window.mouse.move(box.x + box.width * (0.4 / 2.3), box.y + box.height / 2, { steps: 6 })
  await expect(timer).toHaveText(/^0:00\.4 /)
  expect(await window.evaluate(() => (window as unknown as { started: Started }).started)).toEqual([])
  await window.mouse.up()
  await expect.poll(() => window.evaluate(() => (window as unknown as { started: Started }).started.length)).toBe(2)
  const [fromDrag] = await window.evaluate(() => (window as unknown as { started: Started }).started)
  expect(fromDrag).toMatchObject({ offset: 0, length: 0.2 })
  expect(fromDrag?.delay).toBeLessThan(0.15)
})
