import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, makeFolder, type LaunchedApp } from './app'

let launched: LaunchedApp | undefined
let folder: string | undefined

test.afterEach(async () => {
  await launched?.close()
  if (folder) await rm(folder, { recursive: true, force: true })
})

const slowTurn = [{ type: 'thinking' as const }, { type: 'wait' as const, ms: 1500 }, { type: 'text' as const, text: 'Here it is.' }]
const MARKER = '<meta name="margen-template" content="animation-video">'

test('the Animation video card makes a video at the chosen frame size and opens it with the Turn running', async () => {
  folder = await makeFolder({ 'index.html': '<h1>Home</h1>' })
  launched = await launchApp({ pickFolder: folder, pickFiles: [join(folder, 'index.html')], agent: { documentName: 'launch-teaser', turns: [slowTurn] } })
  const { window } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()

  const cards = window.getByRole('list', { name: 'Templates' })
  await expect(cards.getByRole('button')).toHaveText([/^Blank/, /^Animation video/, /^Poster/, /^Slides/])
  await cards.getByRole('button', { name: /Animation video/ }).click()

  const dialog = window.getByRole('dialog', { name: 'Animation video' })
  const frame = dialog.getByRole('radiogroup', { name: 'Frame size' })
  await expect(frame.getByRole('radio', { checked: true })).toHaveAccessibleName(/16:9/)
  await frame.getByRole('radio', { name: /9:16/ }).click()
  await dialog.getByRole('button', { name: 'Attach files' }).click()
  await expect(dialog.getByRole('list', { name: 'Attachments' })).toHaveText('index.html')
  await dialog.getByRole('textbox', { name: 'Describe the new Document' }).fill('A teaser for our launch')
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect(dialog).toBeHidden()
  await expect(window.getByRole('button', { name: 'Switch document' })).toHaveText(/launch-teaser\.html/)
  const chat = window.getByRole('complementary', { name: 'Chat' })
  await expect(chat.getByText('A teaser for our launch')).toBeVisible()
  await expect(chat.getByText('Thinking')).toBeVisible()
  const html = await readFile(join(folder, 'launch-teaser.html'), 'utf8')
  expect(html).toContain(MARKER)
  expect(html).toMatch(/width: 1080px;\s*height: 1920px/)
})

test('@ opens the Templates folder, and an @Animation video chip makes a 16:9 video from the message', async () => {
  folder = await makeFolder({ 'index.html': '<h1>Home</h1>' })
  launched = await launchApp({ pickFolder: folder, agent: { documentName: 'intro', turns: [slowTurn] } })
  const { window } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()

  const bar = window.getByRole('textbox', { name: 'Describe a new page' })
  await bar.pressSequentially('@')
  const picker = window.getByRole('listbox', { name: 'Mentions' })
  await expect(picker.getByRole('option')).toHaveText(['Documents', 'Templates'])
  await bar.press('ArrowDown')
  await bar.press('ArrowRight')
  await expect(picker.getByRole('option')).toHaveText(['Blank', 'Animation video', 'Poster', 'Slides'])
  await bar.press('Backspace')
  await expect(picker.getByRole('option')).toHaveText(['Documents', 'Templates'])
  await expect(bar).toHaveValue('@')
  await expect(picker.getByRole('option', { selected: true })).toHaveText('Templates')
  await bar.press('Enter')
  await bar.press('ArrowDown')
  await bar.press('Enter')

  await expect(window.getByRole('group', { name: 'Template' })).toHaveText(/@Animation video/)
  await expect(bar).toHaveValue('')
  await expect(picker).toBeHidden()
  await bar.pressSequentially('An intro for the site')
  await bar.press('Enter')

  const chat = window.getByRole('complementary', { name: 'Chat' })
  await expect(chat.getByText('An intro for the site')).toBeVisible()
  await expect(window.getByRole('button', { name: 'Switch document' })).toHaveText(/intro\.html/)
  const html = await readFile(join(folder, 'intro.html'), 'utf8')
  expect(html).toContain(MARKER)
  expect(html).toMatch(/width: 1920px;\s*height: 1080px/)
})
