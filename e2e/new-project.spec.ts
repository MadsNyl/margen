import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, type LaunchedApp } from './app'

let launched: LaunchedApp

test.afterEach(async () => {
  await launched?.close()
})

test('New project asks for a name, makes the folder and opens its empty Project page', async () => {
  launched = await launchApp()
  const { window, projectsDir } = launched

  await window.getByRole('button', { name: /New project/ }).click()
  const name = window.getByRole('textbox', { name: 'Project name' })
  await expect(name).toBeFocused()
  await name.fill('Summer Menu')
  await name.press('Enter')

  await expect(window.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible()
  await expect(window.getByText('Describe the first page above, and Claude will make it.')).toBeVisible()
  await expect(window.getByRole('button', { name: 'Switch project' })).toHaveText(/summer-menu/)
  await expect(window.getByText(join(projectsDir, 'summer-menu'))).toBeVisible()
  expect(await readdir(join(projectsDir, 'summer-menu'))).toEqual([])

  await window.getByRole('button', { name: 'Back to Start' }).click()
  const recent = window.getByRole('list', { name: 'Recent projects' })
  await expect(recent.getByRole('button', { name: /^summer-menu.*0 HTML files/ })).toBeVisible()
})

test('⌘N starts naming a Project, Escape cancels, the Create button makes it, and ⌘N works from the Project page too', async () => {
  launched = await launchApp()
  const { window, projectsDir } = launched
  const name = window.getByRole('textbox', { name: 'Project name' })
  await expect(window.getByText('No recent projects yet')).toBeVisible()

  await window.keyboard.press('Meta+N')
  await expect(name).toBeFocused()
  await name.press('Escape')
  await expect(name).toBeHidden()

  await window.keyboard.press('Meta+N')
  await name.fill('Invitation')
  await window.getByRole('button', { name: 'Create' }).click()
  await expect(window.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible()
  expect(await readdir(projectsDir)).toEqual(['invitation'])

  await window.keyboard.press('Meta+N')
  await expect(name).toBeFocused()
  await expect(window.getByRole('list', { name: 'Recent projects' }).getByRole('button', { name: /^invitation/ })).toBeVisible()
})
