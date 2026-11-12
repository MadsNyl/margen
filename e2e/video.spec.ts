import { rm } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { formatTime } from '../src/shared/clock'
import { inDocument, launchApp, makeFolder, type LaunchedApp } from './app'

let launched: LaunchedApp | undefined
let folder: string | undefined

test.afterEach(async () => {
  await launched?.close()
  if (folder) await rm(folder, { recursive: true, force: true })
})

const MARKER = '<meta name="margen-template" content="animation-video">'

/** A 10 s Animation video at 640×360: one scene and a heading that slides in over it. */
const video = (marker = MARKER) => `<!doctype html>
<html>
<head>
${marker}
<style>
  html, body { margin: 0; }
  .stage { position: relative; width: 640px; height: 360px; overflow: hidden; background: #fff; }
  .scene { position: absolute; inset: 0; visibility: hidden; animation: scene 10s linear 0s; }
  @keyframes scene { from, to { visibility: visible; } }
  h1 { margin: 40px; font: 48px sans-serif; animation: slide 4s linear 1s both; }
  @keyframes slide { from { transform: translateX(-200px); } to { transform: translateX(0); } }
</style>
</head>
<body>
<main class="stage"><section class="scene"><h1>Hello</h1></section></main>
</body>
</html>
`

async function openDocument(name: string, files: Record<string, string>, turns: NonNullable<Parameters<typeof launchApp>[0]>['agent'] = {}) {
  folder = await makeFolder(files)
  launched = await launchApp({ pickFolder: folder, agent: turns })
  const { window } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()
  await window.getByRole('list', { name: 'Documents' }).getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')}`) }).click()
  await expect(window.getByRole('region', { name: 'Document view' })).toHaveAttribute('data-ready', 'true')
  return launched
}

/** The page's own clock: every animation's time in seconds and whether it runs. */
const pageClock = (app: LaunchedApp['app']) =>
  inDocument(app, `document.getAnimations().map((a) => [Math.round(a.currentTime) / 1000, a.playState])`) as Promise<[number, string][]>

/** Where an element of the video is in the app's window, with the frame scaled to fit. */
async function centerOf(selector: string) {
  if (!launched) throw new Error('No app')
  const { app, window } = launched
  const rect = (await inDocument(app, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)) as {
    x: number
    y: number
  }
  const frame = await window.getByRole('region', { name: 'Document view' }).boundingBox()
  const scale = (frame?.width ?? 640) / 640
  return { x: (frame?.x ?? 0) + rect.x * scale, y: (frame?.y ?? 0) + rect.y * scale }
}

test('an Animation video plays and pauses from the time bar, a Pick records the paused time, and a reload keeps it', async () => {
  const edited = video().replace('<h1>Hello</h1>', '<h1>Hello there</h1>')
  const { app, window, sentTurns } = await openDocument('intro.html', { 'intro.html': video() }, {
    turns: [[{ type: 'tool', tool: 'edit', file: 'intro.html', added: 1, removed: 1, content: edited }, { type: 'text', text: 'Done.' }]],
  })
  const timer = window.getByRole('timer', { name: 'Time' })
  await expect(timer).toHaveText('0:00.0 / 0:10.0')
  // The whole frame, fitted to the window.
  const frame = window.getByRole('region', { name: 'Document view' })
  const size = await frame.boundingBox()
  expect(Math.round(((size?.width ?? 0) / (size?.height ?? 1)) * 100)).toBe(178)
  expect((await pageClock(app)).every(([time, state]) => time === 0 && state === 'paused')).toBe(true)

  await window.getByRole('button', { name: 'Play' }).click()
  await expect(timer).not.toHaveText(/^0:00\.[0-4] /)
  await window.getByRole('button', { name: 'Pause' }).click()
  await expect(window.getByRole('button', { name: 'Play' })).toBeVisible()
  const shown = (await timer.textContent())?.split(' / ')[0] ?? ''
  const clock = await pageClock(app)
  expect(clock.every(([, state]) => state === 'paused')).toBe(true)
  expect(formatTime(clock[0]?.[0] ?? -1)).toBe(shown)
  expect(new Set(clock.map(([time]) => time)).size).toBe(1)

  await window.getByRole('toolbar', { name: 'Mode' }).getByRole('button', { name: 'Pick' }).click()
  await expect(async () => {
    const heading = await centerOf('h1')
    await window.mouse.click(heading.x, heading.y)
    await expect(window.getByRole('dialog', { name: 'Annotation 1' })).toBeVisible({ timeout: 1000 })
  }).toPass()
  await window.keyboard.type('Slower')
  await window.keyboard.press('Meta+Enter')
  const chat = window.getByRole('complementary', { name: 'Chat' })
  await chat.getByRole('button', { name: 'Send' }).click()

  await expect(chat.getByRole('listitem', { name: 'Annotation 1' })).toContainText(`at ${shown}`)
  await expect.poll(async () => (await sentTurns())[0]?.annotations[0]?.time).toBeDefined()
  expect(formatTime((await sentTurns())[0]?.annotations[0]?.time ?? -1)).toBe(shown)

  // The edit reloads the Document; it comes back paused where it was.
  await expect.poll(() => inDocument(app, `document.querySelector('h1').textContent`)).toBe('Hello there')
  await expect(timer).toHaveText(`${shown} / 0:10.0`)
  await expect.poll(async () => (await pageClock(app)).map(([time, state]) => `${formatTime(time)} ${state}`)).toEqual([`${shown} paused`, `${shown} paused`])
})

test("an ordinary Document has no video controls and its animations run on their own, until a reload adds the marker", async () => {
  const plain = video('')
  const { app, window } = await openDocument('intro.html', { 'intro.html': plain }, {
    turns: [[{ type: 'tool', tool: 'edit', file: 'intro.html', added: 1, removed: 0, content: video() }, { type: 'text', text: 'Done.' }]],
  })
  await expect(window.getByRole('button', { name: 'Viewport' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Play' })).toBeHidden()
  await expect(window.getByRole('timer', { name: 'Time' })).toBeHidden()
  await expect(window.getByRole('group', { name: 'Time bar' })).toBeHidden()
  expect((await pageClock(app)).every(([, state]) => state === 'running')).toBe(true)

  const chat = window.getByRole('complementary', { name: 'Chat' })
  await chat.getByRole('textbox', { name: 'Message' }).fill('Make it a video')
  await chat.getByRole('button', { name: 'Send' }).click()

  await expect(window.getByRole('timer', { name: 'Time' })).toHaveText('0:00.0 / 0:10.0')
  await expect(window.getByRole('button', { name: 'Play' })).toBeVisible()
  expect((await pageClock(app)).every(([, state]) => state === 'paused')).toBe(true)
})

/** Where the h1 is across the frame, in the page's own pixels: it slides from -200px to 0 between 1 s and 5 s. */
const headingShift = (app: LaunchedApp['app']) => inDocument(app, `Math.round(new DOMMatrix(getComputedStyle(document.querySelector('h1')).transform).m41)`) as Promise<number>

test('the time bar under the video scrubs it: drag seeks live, click jumps, the arrows nudge, and markers and Annotations follow', async () => {
  const { app, window, sentTurns } = await openDocument('intro.html', { 'intro.html': video() }, { turns: [[{ type: 'text', text: 'Done.' }]] })
  const frame = window.getByRole('region', { name: 'Document view' })
  const bar = window.getByRole('group', { name: 'Time bar' })
  const timer = bar.getByRole('timer', { name: 'Time' })
  await expect(timer).toHaveText('0:00.0 / 0:10.0')

  // Directly under the frame and as wide as it; the top bar keeps Export only.
  const [frameBox, barBox] = [await frame.boundingBox(), await bar.boundingBox()]
  expect(Math.round(barBox?.width ?? 0)).toBe(Math.round(frameBox?.width ?? -1))
  expect(Math.round(barBox?.x ?? 0)).toBe(Math.round(frameBox?.x ?? -1))
  expect(barBox?.y ?? 0).toBeGreaterThanOrEqual((frameBox?.y ?? 0) + (frameBox?.height ?? 0))
  expect((barBox?.y ?? 0) - (frameBox?.y ?? 0) - (frameBox?.height ?? 0)).toBeLessThan(24)
  await expect(bar.getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(bar.getByRole('button', { name: 'Voice' })).toBeVisible()
  const top = window.locator('main header')
  await expect(top.getByRole('button', { name: 'Export' })).toBeVisible()
  await expect(top.getByRole('button', { name: 'Voice' })).toBeHidden()
  await expect(top.getByRole('timer')).toBeHidden()

  // Drag: the page follows the pointer while it's down, and stays paused where it's let go.
  const track = bar.getByRole('slider', { name: 'Seek' })
  const box = (await track.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }
  const at = (fraction: number) => ({ x: box.x + box.width * fraction, y: box.y + box.height / 2 })
  await window.mouse.move(at(0).x, at(0).y)
  await window.mouse.down()
  await window.mouse.move(at(0.6).x, at(0.6).y, { steps: 8 })
  await expect.poll(async () => (await pageClock(app))[0]?.[0]).toBeCloseTo(6, 0)
  await expect(timer).toHaveText(/^0:0(5\.9|6\.0|6\.1) \/ 0:10\.0$/)
  await window.mouse.move(at(0.3).x, at(0.3).y, { steps: 8 })
  await window.mouse.up()
  await expect.poll(async () => (await pageClock(app))[0]?.[0]).toBeCloseTo(3, 0)
  const clock = await pageClock(app)
  expect(clock.every(([, state]) => state === 'paused')).toBe(true)
  await expect(timer).toHaveText(`${formatTime(clock[0]?.[0] ?? -1)} / 0:10.0`)
  await expect(track).toHaveAttribute('aria-valuetext', formatTime(clock[0]?.[0] ?? -1))
  expect(await headingShift(app)).toBeCloseTo(-200 * (1 - ((clock[0]?.[0] ?? 0) - 1) / 4), -1)

  // The keys, once it's focused: a frame, or a second with ⇧.
  await track.click({ position: { x: box.width * 0.5, y: box.height / 2 } })
  await expect(timer).toHaveText('0:05.0 / 0:10.0')
  await track.press('Shift+ArrowLeft')
  await expect(timer).toHaveText('0:04.0 / 0:10.0')
  await track.press('ArrowRight')
  await track.press('ArrowRight')
  await track.press('ArrowRight')
  await expect(timer).toHaveText('0:04.1 / 0:10.0')
  await expect.poll(async () => (await pageClock(app))[0]?.[0]).toBe(4.1)

  // A Pick's marker follows the heading as the video is seeked under it, and the Annotation records the time seeked to.
  await track.press('Shift+ArrowLeft')
  await track.press('Shift+ArrowLeft')
  await expect(timer).toHaveText('0:02.1 / 0:10.0')
  await window.getByRole('toolbar', { name: 'Mode' }).getByRole('button', { name: 'Pick' }).click()
  await expect(async () => {
    const heading = await centerOf('h1')
    await window.mouse.click(heading.x, heading.y)
    await expect(window.getByRole('dialog', { name: 'Annotation 1' })).toBeVisible({ timeout: 1000 })
  }).toPass()
  await window.keyboard.type('Here')
  await window.keyboard.press('Meta+Enter')
  const marker = frame.locator('[data-marker="1"]')
  /** Its centre, which its pop-in doesn't move. */
  const markerX = async () => {
    const at = await marker.boundingBox()
    return (at?.x ?? 0) + (at?.width ?? 0) / 2
  }
  const before = await markerX()
  await track.click({ position: { x: box.width * 0.5, y: box.height / 2 } })
  await expect(timer).toHaveText('0:05.0 / 0:10.0')
  const scale = (frameBox?.width ?? 640) / 640
  await expect.poll(async () => (await markerX()) - before).toBeCloseTo(((200 * 2.9) / 4) * scale, -1)

  const chat = window.getByRole('complementary', { name: 'Chat' })
  await chat.getByRole('button', { name: 'Send' }).click()
  await expect.poll(async () => (await sentTurns())[0]?.annotations[0]?.time).toBeCloseTo(2.1, 3)
})

test('releasing the track plays on when it was playing', async () => {
  const { app, window } = await openDocument('intro.html', { 'intro.html': video() })
  const bar = window.getByRole('group', { name: 'Time bar' })
  const track = bar.getByRole('slider', { name: 'Seek' })
  await expect(bar.getByRole('timer', { name: 'Time' })).toHaveText('0:00.0 / 0:10.0')
  await bar.getByRole('button', { name: 'Play' }).click()
  const box = (await track.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }
  await window.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
  await window.mouse.down()
  // Paused while it's held.
  await expect.poll(async () => (await pageClock(app))[0]?.[1]).toBe('paused')
  await window.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 4 })
  await expect.poll(async () => (await pageClock(app))[0]?.[0]).toBeCloseTo(7, 0)
  await window.mouse.up()
  await expect(bar.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect.poll(async () => (await pageClock(app))[0]?.[0]).toBeGreaterThan(7.2)
})
