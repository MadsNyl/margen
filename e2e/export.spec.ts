import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { mp4Tracks } from '../test/seam1/mp4'
import { launchApp, makeFolder, type LaunchedApp } from './app'

let launched: LaunchedApp | undefined
let folder: string | undefined

test.afterEach(async () => {
  await launched?.close()
  if (folder) await rm(folder, { recursive: true, force: true })
})

/** A 1.5 s Animation video at 1280×720, bigger than the editor shows it: a box that slides across. */
const video = `<!doctype html>
<html>
<head>
<meta name="margen-template" content="animation-video">
<style>
  html, body { margin: 0; }
  .stage { position: relative; width: 1280px; height: 720px; overflow: hidden; background: #fff; }
  .box { position: absolute; top: 300px; width: 120px; height: 120px; background: #0a7; animation: slide 1.5s linear both; }
  @keyframes slide { from { left: 0; } to { left: 1160px; } }
</style>
</head>
<body>
<main class="stage"><div class="box"></div></main>
</body>
</html>
`

test('Export saves the Animation video as an MP4 at its frame size, a frame per 30th of a second, leaving the editor paused where it was', async () => {
  folder = await makeFolder({ 'clip.html': video })
  const saveFile = join(folder, 'clip.mp4')
  launched = await launchApp({ pickFolder: folder, saveFile })
  const { window } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()
  await window.getByRole('list', { name: 'Documents' }).getByRole('button', { name: /^clip\.html/ }).click()
  const timer = window.getByRole('timer', { name: 'Time' })
  await expect(timer).toHaveText('0:00.0 / 0:01.5')

  await window.getByRole('button', { name: 'Export' }).click()

  await expect(window.getByRole('status').filter({ hasText: 'Exported clip.mp4' })).toBeVisible({ timeout: 30_000 })
  const [track, ...others] = mp4Tracks(await readFile(saveFile))
  expect(others).toEqual([])
  expect(track).toMatchObject({ handler: 'vide', codec: 'avc1', samples: 45, width: 1280, height: 720 })
  expect(track?.duration).toBeCloseTo(1.5, 2)
  await expect(timer).toHaveText('0:00.0 / 0:01.5')
})
