import { rm } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { FakeAgentScript } from '../src/main/agent/fake'
import { inDocument, launchApp, makeFolder, type LaunchedApp } from './app'

let launched: LaunchedApp | undefined
let folder: string | undefined

test.afterEach(async () => {
  await launched?.close()
  if (folder) await rm(folder, { recursive: true, force: true })
})

async function openEditor(agent: FakeAgentScript) {
  folder = await makeFolder({
    'index.html': '<!doctype html><h1>Home</h1><a id="about" href="about.html">About</a>',
    'about.html': '<!doctype html><h1>About</h1>',
  })
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
  return { ...launched, chat, composer, send, switchTo, log: chat.getByRole('log', { name: 'Conversation' }) }
}

test("switching Documents switches the chat to that Document's Session", async () => {
  const { chat, log, send, switchTo } = await openEditor({
    turns: [[{ type: 'text', text: 'Home reply.' }], [{ type: 'text', text: 'About reply.' }]],
  })
  await send('Home ask', 'Home reply.')

  await switchTo('about.html')
  await expect(log).not.toContainText('Home ask')
  await expect(chat.getByText('Session 1', { exact: true }).filter({ visible: true })).toBeVisible()
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
  await expect(chat.getByText('Session 2', { exact: true }).filter({ visible: true })).toBeVisible()
  await expect(log).not.toContainText('First ask')
  await send('Second ask', 'Two.')

  await chat.getByRole('button', { name: 'Sessions & Checkpoints' }).click()
  const drawer = chat.getByRole('region', { name: 'History' })
  const sessions = drawer.getByRole('list', { name: 'Sessions' }).getByRole('button')
  await expect(sessions).toHaveText([/Session 2\s*● Active.*1 turn.*Second ask/, /Session 1.*1 turn.*First ask/])
  await sessions.nth(1).click()

  await expect(drawer).toBeHidden()
  await expect(chat.getByText('Session 1', { exact: true }).filter({ visible: true })).toBeVisible()
  await expect(log).toContainText('First ask')
  await expect(log).toContainText('One.')
  await expect(log).not.toContainText('Second ask')
  await send('Continue', 'Back again.')
})

test('switching Documents or Sessions while a Turn runs asks first: Cancel keeps it running, Stop and switch stops it', async () => {
  const { app, window, chat, composer, log, switchTo } = await openEditor({
    turns: [
      [{ type: 'text', text: 'Working on it' }, { type: 'wait', ms: 1500 }, { type: 'text', text: 'Home done.' }],
      [{ type: 'text', text: 'Busy again' }, { type: 'wait', ms: 30_000 }],
      [{ type: 'text', text: 'Busy once more' }, { type: 'wait', ms: 30_000 }],
    ],
  })
  const documentName = window.getByRole('button', { name: 'Switch document' })
  const ask = window.getByRole('alertdialog', { name: 'A Turn is running' })
  const start = async (text: string, reply: string) => {
    await composer.fill(text)
    await composer.press('Enter')
    await expect(chat.getByText(reply)).toBeVisible()
  }

  // Another Document: Cancel leaves the Turn running and the Document open.
  await start('Home ask', 'Working on it')
  await documentName.click()
  await window.getByRole('menuitem', { name: 'about.html' }).click()
  await expect(ask).toContainText('Stop it and switch?')
  await ask.getByRole('button', { name: 'Cancel' }).click()
  await expect(ask).toBeHidden()
  await expect(documentName).toHaveText(/index\.html/)
  await expect(chat.getByText('Home done.')).toBeVisible()

  // With no Turn running it doesn't ask.
  await switchTo('about.html')
  await switchTo('index.html')

  // New session: Stop and switch stops the Turn, which the earlier Session keeps as interrupted.
  await start('Second ask', 'Busy again')
  await chat.getByRole('button', { name: 'New session' }).click()
  await ask.getByRole('button', { name: 'Stop and switch' }).click()
  await expect(chat.getByText('Session 2', { exact: true }).filter({ visible: true })).toBeVisible()
  await chat.getByRole('button', { name: 'Sessions & Checkpoints' }).click()
  await chat.getByRole('list', { name: 'Sessions' }).getByRole('button', { name: /Session 1/ }).click()
  await expect(log).toContainText('Second ask')
  await expect(log.getByText(/^Interrupted/)).toBeVisible()

  // A link in the Document to another Document asks too.
  await start('Third ask', 'Busy once more')
  await inDocument(app, `document.querySelector('#about').click()`)
  await ask.getByRole('button', { name: 'Stop and switch' }).click()
  await expect(documentName).toHaveText(/about\.html/)
})
