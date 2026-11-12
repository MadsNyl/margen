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

test('an Animation video plays and pauses from the top bar, a Pick records the paused time, and a reload keeps it', async () => {
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
  expect((await pageClock(app)).every(([, state]) => state === 'running')).toBe(true)

  const chat = window.getByRole('complementary', { name: 'Chat' })
  await chat.getByRole('textbox', { name: 'Message' }).fill('Make it a video')
  await chat.getByRole('button', { name: 'Send' }).click()

  await expect(window.getByRole('timer', { name: 'Time' })).toHaveText('0:00.0 / 0:10.0')
  await expect(window.getByRole('button', { name: 'Play' })).toBeVisible()
  expect((await pageClock(app)).every(([, state]) => state === 'paused')).toBe(true)
})
