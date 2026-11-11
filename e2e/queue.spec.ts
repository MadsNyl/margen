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
  folder = await makeFolder({ 'index.html': '<!doctype html><h1>Small</h1>', 'about.html': '<!doctype html><h1>About</h1>' })
  launched = await launchApp({ pickFolder: folder, agent })
  const { window } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()
  await window.getByRole('list', { name: 'Documents' }).getByRole('button', { name: /^index\.html/ }).click()
  const chat = window.getByRole('complementary', { name: 'Chat' })
  return { ...launched, chat, composer: chat.getByRole('textbox', { name: 'Message' }), queue: chat.getByRole('region', { name: 'Queue' }) }
}

test('sending during a Turn queues the message above the Composer; it goes out when the Turn ends, and can be removed first', async () => {
  const { chat, composer, queue } = await openEditor({
    turns: [
      [{ type: 'wait', ms: 1500 }, { type: 'text', text: 'First done.' }],
      [{ type: 'text', text: 'Second done.' }],
    ],
  })

  await composer.fill('Make the heading bigger')
  await composer.press('Enter')
  await expect(chat.getByText('Thinking')).toBeVisible()
  await expect(queue).toBeHidden()

  await composer.fill('And make it blue')
  await expect(chat.getByRole('button', { name: 'Queue' })).toBeEnabled()
  await composer.press('Enter')
  await composer.fill('Never mind this one')
  await chat.getByRole('button', { name: 'Queue' }).click()

  await expect(queue.getByRole('listitem')).toHaveText([/And make it blue/, /Never mind this one/])
  await queue.getByRole('listitem').filter({ hasText: 'Never mind' }).getByRole('button', { name: 'Remove' }).click()
  await expect(queue.getByRole('listitem')).toHaveText([/And make it blue/])

  await expect(chat.getByText('First done.')).toBeVisible()
  await expect(chat.getByText('Second done.')).toBeVisible()
  await expect(queue).toBeHidden()
  await expect(chat.getByText('Never mind this one')).toBeHidden()
  await expect(chat.getByRole('button', { name: 'Send' })).toBeVisible()
})

test('Stop interrupts the Turn, and the Queue waits until the next send', async () => {
  const { window, chat, composer, queue } = await openEditor({
    turns: [[{ type: 'text', text: 'Working on it' }, { type: 'wait', ms: 30_000 }], [{ type: 'wait', ms: 30_000 }]],
  })

  await composer.fill('Make the heading bigger')
  await composer.press('Enter')
  await composer.fill('And make it blue')
  await composer.press('Enter')
  await expect(queue.getByRole('listitem')).toHaveText([/And make it blue/])

  await chat.getByRole('button', { name: 'Stop' }).click()
  await expect(chat.getByText(/^Interrupted/)).toBeVisible()
  await expect(chat.getByRole('button', { name: 'Stop' })).toBeHidden()
  await expect(queue).toContainText('waits until you send again')
  await expect(queue.getByRole('listitem')).toHaveText([/And make it blue/])

  // Sending again releases the Queue; Esc stops the next Turn too.
  await composer.fill('Go on')
  await composer.press('Enter')
  await expect(queue.getByRole('listitem')).toHaveText([/Go on/])
  await expect(chat.getByRole('log').getByText('And make it blue')).toBeVisible()
  await window.keyboard.press('Escape')
  await expect(chat.getByText(/^Interrupted/)).toHaveCount(2)
})

test('Esc leaves Pick or Draw and leaves the Turn running; with nothing else to do it stops the Turn, also with the Document focused', async () => {
  const { app, window, chat, composer } = await openEditor({ turns: [[{ type: 'text', text: 'Working on it' }, { type: 'wait', ms: 30_000 }]] })
  const toolbar = window.getByRole('toolbar', { name: 'Mode' })
  const stop = chat.getByRole('button', { name: 'Stop' })
  const escInDocument = () => inDocument(app, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await composer.fill('Make the heading bigger')
  await composer.press('Enter')
  await expect(chat.getByText('Working on it')).toBeVisible()

  for (const mode of ['Pick', 'Draw']) {
    await toolbar.getByRole('button', { name: mode }).click()
    await window.keyboard.press('Escape')
    await expect(toolbar.getByRole('button', { name: 'Browse' })).toHaveAttribute('aria-pressed', 'true')
    await expect(stop).toBeVisible()
  }

  await toolbar.getByRole('button', { name: 'Pick' }).click()
  await escInDocument()
  await expect(toolbar.getByRole('button', { name: 'Browse' })).toHaveAttribute('aria-pressed', 'true')
  await expect(stop).toBeVisible()

  await escInDocument()
  await expect(chat.getByText(/^Interrupted/)).toBeVisible()
  await expect(stop).toBeHidden()
})

test('the model and effort menu sets them for the next Turns, in every Document', async () => {
  const { window, chat, composer, sentTurns } = await openEditor({})
  const picker = chat.getByRole('button', { name: 'Model and effort' })
  await expect(picker).toHaveText('Default model')

  await picker.click()
  await chat.getByRole('menuitem', { name: 'Opus' }).click()
  await expect(picker).toHaveText('Opus')
  await picker.click()
  await chat.getByRole('menuitem', { name: 'High' }).click()
  await expect(picker).toHaveText('Opus · High')

  // Another Document keeps the choice, and its Turns use it.
  await window.getByRole('button', { name: 'Switch document' }).click()
  await window.getByRole('menuitem', { name: 'about.html' }).click()
  await expect(window.getByRole('button', { name: 'Switch document' })).toHaveText(/about\.html/)
  await expect(picker).toHaveText('Opus · High')
  await composer.fill('Hello')
  await composer.press('Enter')
  await expect.poll(sentTurns).toEqual([{ text: 'Hello', annotations: [], model: 'opus', effort: 'high' }])
})
