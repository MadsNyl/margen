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

const detect = { installed: true, path: '/Users/me/.local/bin/claude', version: '2.4.1', signedIn: true, plan: 'Max' }

test('Settings from the Start screen shows the Agent, switches the preset and has About', async () => {
  launched = await launchApp({ agent: { detect } })
  const { window, dataDir } = launched

  await window.getByRole('button', { name: 'Settings' }).click()
  const dialog = window.getByRole('dialog', { name: 'Settings' })
  await expect(dialog).toBeVisible()

  const agent = dialog.getByRole('region', { name: 'Agent' })
  await expect(agent).toContainText('Claude Code')
  await expect(agent).toContainText('/Users/me/.local/bin/claude · v2.4.1 · signed in (Max)')
  await expect(agent.getByRole('status', { name: 'Claude Code' })).toHaveText('Ready')
  await expect(agent).toContainText('Codex')
  await expect(agent).toContainText('Coming in 1.1')

  const permissions = dialog.getByRole('region', { name: 'Permissions' })
  const editor = permissions.getByRole('radio', { name: /Editor preset/ })
  const all = permissions.getByRole('radio', { name: /Allow everything/ })
  await expect(editor).toBeChecked()
  await all.click()
  await expect(all).toBeChecked()
  await expect(editor).not.toBeChecked()
  await expect.poll(async () => JSON.parse(await readFile(join(dataDir, 'permissions.json'), 'utf8'))).toEqual({
    preset: 'allow-everything',
  })

  const about = dialog.getByRole('region', { name: 'About' })
  const { version } = JSON.parse(await readFile(join(__dirname, '../package.json'), 'utf8'))
  await expect(about).toContainText(`Margen ${version}`)
  // Dev builds and tests have no release feed.
  await expect(about.getByRole('button', { name: 'Check for updates' })).toBeDisabled()

  await window.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('Settings opens from the Project page and from the Composer badge', async () => {
  folder = await makeFolder({ 'index.html': '<!doctype html><h1>Bakery</h1>' })
  launched = await launchApp({ pickFolder: folder })
  const { window } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()

  await window.getByRole('button', { name: 'Settings' }).click()
  const dialog = window.getByRole('dialog', { name: 'Settings' })
  await expect(dialog.getByRole('region', { name: 'Agent' })).toContainText('signed in')
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toHaveCount(0)

  await window.getByRole('list', { name: 'Documents' }).getByRole('button', { name: /^index\.html/ }).click()
  const chat = window.getByRole('complementary', { name: 'Chat' })
  const badge = chat.getByRole('button', { name: 'Permission preset' })
  await expect(badge).toHaveText('Editor')
  await badge.click()
  await dialog.getByRole('radio', { name: /Allow everything/ }).click()
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(badge).toHaveText('Allow all')
})
