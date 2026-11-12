import { readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { inDocument, launchApp, makeFolder, type LaunchedApp } from './app'

let launched: LaunchedApp | undefined
let folder: string | undefined

test.afterEach(async () => {
  await launched?.close()
  if (folder) await rm(folder, { recursive: true, force: true })
})

test("Revert to here restores the Document's file to before the Turn, and the Document reloads", async () => {
  folder = await makeFolder({ 'index.html': '<!doctype html><h1>Small</h1>' })
  launched = await launchApp({
    pickFolder: folder,
    agent: {
      turns: [
        [
          { type: 'tool', tool: 'edit', file: 'index.html', added: 1, removed: 1, content: '<!doctype html><h1>Big</h1>' },
          { type: 'tool', tool: 'write', file: 'about.html', added: 1, content: '<!doctype html><h1>About</h1>' },
          { type: 'text', text: 'Done.' },
        ],
      ],
    },
  })
  const { app, window } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()
  await window.getByRole('list', { name: 'Documents' }).getByRole('button', { name: /^index\.html/ }).click()
  await expect(window.getByRole('region', { name: 'Document view' })).toHaveAttribute('data-ready', 'true')
  const chat = window.getByRole('complementary', { name: 'Chat' })
  const composer = chat.getByRole('textbox', { name: 'Message' })

  await composer.fill('Make the heading bigger')
  await composer.press('Enter')
  await expect(chat.getByText('Done.')).toBeVisible()
  await expect.poll(() => inDocument(app, `document.querySelector('h1').textContent`)).toBe('Big')

  const divider = chat.getByRole('separator', { name: 'Checkpoint 1' })
  await expect(divider).toBeVisible()
  await divider.getByRole('button', { name: 'Revert to here' }).click()

  await expect.poll(() => inDocument(app, `document.querySelector('h1').textContent`)).toBe('Small')
  expect(await readFile(join(folder, 'index.html'), 'utf8')).toBe('<!doctype html><h1>Small</h1>')
  // Checkpoints belong to the Document: the other file the Turn wrote stays.
  expect((await readdir(folder)).sort()).toEqual(['about.html', 'index.html'])

  // The list shows it too, with the Checkpoint the revert took first.
  await chat.getByRole('button', { name: 'Sessions & Checkpoints' }).click()
  await chat.getByRole('tab', { name: 'Checkpoints' }).click()
  const list = chat.getByRole('list', { name: 'Checkpoints' })
  await expect(list.getByRole('listitem')).toHaveText([
    /^Now/,
    /^Checkpoint 2\s*Revert\s*Before a revert/,
    /^Checkpoint 1\s*Revert\s*Before a turn · index\.html · Session 1/,
  ])
})
