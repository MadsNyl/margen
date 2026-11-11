import { expect, test } from '@playwright/test'
import { launchApp, type LaunchedApp } from './app'

let launched: LaunchedApp

test.afterEach(async () => {
  await launched?.close()
})

test('boots to the Start screen and clears the recent Projects through the host API', async () => {
  launched = await launchApp({
    recents: [{ path: '/Users/me/Sites/studio', name: 'studio', openedAt: '2026-11-10T09:00:00.000Z' }],
  })
  const { window } = launched

  await expect(window.getByRole('heading', { name: 'Open a project, or start a new one' })).toBeVisible()
  await expect(window.getByText('margen', { exact: true })).toBeVisible()
  await expect(window.getByRole('button', { name: /Open a folder/ })).toBeVisible()
  await expect(window.getByRole('button', { name: /New project/ })).toBeVisible()

  const recent = window.getByRole('list', { name: 'Recent projects' })
  await expect(recent.getByRole('button', { name: /^studio/ })).toBeVisible()
  await window.getByRole('button', { name: 'Clear' }).click()
  await expect(recent).toHaveCount(0)
  await expect(window.getByText('No recent projects yet')).toBeVisible()
})

test('the renderer has no Node access', async () => {
  launched = await launchApp()
  const exposed = await launched.window.evaluate(() => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
    margen: typeof (globalThis as { margen?: unknown }).margen,
  }))
  expect(exposed).toEqual({ require: 'undefined', process: 'undefined', margen: 'object' })
})
