import { rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, makeFolder, type LaunchedApp } from './app'

let launched: LaunchedApp | undefined
let folder: string | undefined

test.afterEach(async () => {
  await launched?.close()
  if (folder) await rm(folder, { recursive: true, force: true })
})

test('opens a folder and lists its HTML files as Documents, live', async () => {
  folder = await makeFolder({
    'index.html': '<h1>Home</h1>',
    'campaigns/christmas.html': '',
    'node_modules/pkg/readme.html': '',
    'notes.md': '',
  })
  launched = await launchApp({ pickFolder: folder })
  const { window } = launched
  const name = basename(folder)

  await window.getByRole('button', { name: /Open a folder/ }).click()

  await expect(window.getByRole('heading', { name: /Let us build/ })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Switch project' })).toHaveText(new RegExp(name))
  const documents = window.getByRole('list', { name: 'Documents' })
  await expect(documents.getByRole('button')).toHaveCount(2)
  await expect(documents.getByRole('button', { name: /^index\.html/ })).toBeVisible()
  await expect(documents.getByRole('button', { name: /^christmas\.html\s*campaigns\// })).toBeVisible()
  await expect(window.getByText('2 Documents')).toBeVisible()
  await expect(window.getByText('node_modules is hidden')).toBeVisible()

  await writeFile(join(folder, 'menu.html'), '')
  await expect(documents.getByRole('button', { name: /^menu\.html/ })).toBeVisible()

  await window.getByRole('button', { name: 'Back to Start' }).click()
  const recent = window.getByRole('list', { name: 'Recent projects' })
  await expect(recent.getByRole('button', { name: new RegExp(`^${name}.*3 Documents`) })).toBeVisible()
})

test('⌘O opens a folder, a recent Project opens in a click, and a missing one says so', async () => {
  folder = await makeFolder({ 'index.html': '' })
  launched = await launchApp({
    pickFolder: folder,
    recents: [{ path: '/nowhere/old-site', name: 'old-site', openedAt: '2026-11-01T09:00:00.000Z' }],
  })
  const { window } = launched
  const recent = window.getByRole('list', { name: 'Recent projects' })
  await expect(recent.getByRole('button', { name: /^old-site.*Folder not found/ })).toBeDisabled()

  await window.keyboard.press('Meta+O')
  await expect(window.getByRole('list', { name: 'Documents' }).getByRole('button')).toHaveCount(1)
  await window.getByRole('button', { name: 'Back to Start' }).click()

  await recent.getByRole('button', { name: new RegExp(`^${basename(folder)}`) }).click()
  await expect(window.getByRole('heading', { name: /Let us build/ })).toBeVisible()
})
