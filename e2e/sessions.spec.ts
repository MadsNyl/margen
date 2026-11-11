import { rm } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { FakeAgentScript } from '../src/main/agent/fake'
import { launchApp, makeFolder, type LaunchedApp } from './app'

let launched: LaunchedApp | undefined
let folder: string | undefined

test.afterEach(async () => {
  await launched?.close()
  if (folder) await rm(folder, { recursive: true, force: true })
})

async function openEditor(agent: FakeAgentScript) {
  folder = await makeFolder({ 'index.html': '<!doctype html><h1>Home</h1>', 'about.html': '<!doctype html><h1>About</h1>' })
  launched = await launchApp({ pickFolder: folder, agent })
  const { window } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()
  await window.getByRole('list', { name: 'Documents' }).getByRole('button', { name: /^index\.html/ }).click()
  const chat = window.getByRole('complementary', { name: 'Chat' })
  const composer = chat.getByRole('textbox', { name: 'Message' })
  const send = async (text: string, reply: string) => {
    await composer.fill(text)
    await composer.press('Enter')
    await expect(chat.getByText(reply)).toBeVisible()
  }
  const switchTo = async (name: string) => {
    await window.getByRole('button', { name: 'Switch document' }).click()
    await window.getByRole('menuitem', { name }).click()
    await expect(window.getByRole('button', { name: 'Switch document' })).toHaveText(new RegExp(name.replace('.', '\\.')))
  }
  return { ...launched, chat, send, switchTo, log: chat.getByRole('log', { name: 'Conversation' }) }
}

test("switching Documents switches the chat to that Document's Session", async () => {
  const { chat, log, send, switchTo } = await openEditor({
    turns: [[{ type: 'text', text: 'Home reply.' }], [{ type: 'text', text: 'About reply.' }]],
  })
  await send('Home ask', 'Home reply.')

  await switchTo('about.html')
  await expect(log).not.toContainText('Home ask')
  await expect(chat.getByText('· Session 1', { exact: true })).toBeVisible()
  await send('About ask', 'About reply.')

  await switchTo('index.html')
  await expect(log).toContainText('Home ask')
  await expect(log).toContainText('Home reply.')
  await expect(log).not.toContainText('About ask')
})

test('New session starts an empty chat, and the history drawer resumes the earlier one', async () => {
  const { chat, log, send } = await openEditor({
    turns: [[{ type: 'text', text: 'One.' }], [{ type: 'text', text: 'Two.' }], [{ type: 'text', text: 'Back again.' }]],
  })
  await send('First ask', 'One.')

  await chat.getByRole('button', { name: 'New session' }).click()
  await expect(chat.getByText('· Session 2', { exact: true })).toBeVisible()
  await expect(log).not.toContainText('First ask')
  await send('Second ask', 'Two.')

  await chat.getByRole('button', { name: 'Sessions & Checkpoints' }).click()
  const drawer = chat.getByRole('region', { name: 'History' })
  const sessions = drawer.getByRole('list', { name: 'Sessions' }).getByRole('button')
  await expect(sessions).toHaveText([/Session 2\s*● Active.*1 turn.*Second ask/, /Session 1.*1 turn.*First ask/])
  await sessions.nth(1).click()

  await expect(drawer).toBeHidden()
  await expect(chat.getByText('· Session 1', { exact: true })).toBeVisible()
  await expect(log).toContainText('First ask')
  await expect(log).toContainText('One.')
  await expect(log).not.toContainText('Second ask')
  await send('Continue', 'Back again.')
})
