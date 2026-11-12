import { readdir, rm } from 'node:fs/promises'
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

test('describing a page in a new Project lands in the editor on a new Document with the Turn running', async () => {
  launched = await launchApp({ agent: { turns: [slowTurn] } })
  const { window, projectsDir } = launched
  await window.getByRole('button', { name: /New project/ }).click()
  await window.getByRole('textbox', { name: 'Project name' }).fill('Bakery')
  await window.getByRole('textbox', { name: 'Project name' }).press('Enter')

  const bar = window.getByRole('textbox', { name: 'Describe a new page' })
  await expect(bar).toBeFocused()
  await expect(window.getByRole('button', { name: 'Start', exact: true })).toBeDisabled()
  await bar.fill('A landing page for the bakery')
  await bar.press('Enter')

  const chat = window.getByRole('complementary', { name: 'Chat' })
  await expect(chat.getByText('A landing page for the bakery')).toBeVisible()
  await expect(chat.getByText('Thinking')).toBeVisible()
  await expect(window.getByRole('button', { name: 'Switch document' })).toHaveText(/landing-page-for-the-bakery\.html/)
  expect(await readdir(join(projectsDir, 'bakery'))).toEqual(['landing-page-for-the-bakery.html'])
  await expect(chat.getByText('Here it is.')).toBeVisible()
})

test('@ offers the Project’s Documents, and sending opens the chosen one with the message', async () => {
  folder = await makeFolder({ 'index.html': '<h1>Home</h1>', 'campaigns/christmas.html': '<h1>Christmas</h1>' })
  launched = await launchApp({ pickFolder: folder, agent: { turns: [slowTurn] } })
  const { window } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()

  const bar = window.getByRole('textbox', { name: 'Describe a new page' })
  await bar.fill('Make ')
  await bar.pressSequentially('@chr')
  const picker = window.getByRole('listbox', { name: 'Documents' })
  await expect(picker.getByRole('option')).toHaveText([/christmas\.html\s*campaigns\//])
  await bar.press('Backspace')
  await bar.press('Backspace')
  await bar.press('Backspace')
  await expect(picker.getByRole('option')).toHaveCount(2)
  await bar.press('ArrowDown')
  await expect(picker.getByRole('option', { selected: true })).toHaveText(/christmas/)
  await bar.press('Enter')
  await expect(bar).toHaveValue('Make @campaigns/christmas.html ')
  await expect(picker).toBeHidden()

  await bar.pressSequentially('warmer')
  await bar.press('Enter')

  const chat = window.getByRole('complementary', { name: 'Chat' })
  await expect(chat.getByText('Make @campaigns/christmas.html warmer')).toBeVisible()
  await expect(chat.getByText('Thinking')).toBeVisible()
  await expect(window.getByRole('button', { name: 'Switch document' })).toHaveText(/christmas\.html/)
})

test("the editor's switcher ends with New Document: describe it, and it opens under the Agent's name with the Turn running", async () => {
  folder = await makeFolder({ 'index.html': '<h1>Home</h1>' })
  launched = await launchApp({ pickFolder: folder, agent: { documentName: 'bakery-sales-dashboard', turns: [slowTurn] } })
  const { window } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()
  await window.getByRole('button', { name: /index\.html/ }).click()

  const switcher = window.getByRole('button', { name: 'Switch document' })
  await switcher.click()
  await expect(window.getByRole('menuitem').last()).toHaveText('+New Document…')
  await window.getByRole('menuitem', { name: 'New Document…' }).click()

  const dialog = window.getByRole('dialog', { name: 'New Document' })
  await dialog.getByRole('textbox', { name: 'Describe the new Document' }).fill('let us write a dashboard for my bakery sales')
  await dialog.getByRole('textbox', { name: 'Describe the new Document' }).press('Enter')

  await expect(dialog).toBeHidden()
  await expect(switcher).toHaveText(/bakery-sales-dashboard\.html/)
  const chat = window.getByRole('complementary', { name: 'Chat' })
  await expect(chat.getByText('let us write a dashboard for my bakery sales')).toBeVisible()
  await expect(chat.getByText('Here it is.')).toBeVisible()
  expect((await readdir(folder)).sort()).toEqual(['bakery-sales-dashboard.html', 'index.html'])
})
