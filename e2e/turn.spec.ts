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
  folder = await makeFolder({ 'index.html': '<!doctype html><h1>Small</h1>' })
  launched = await launchApp({ pickFolder: folder, agent })
  const { window } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()
  await window.getByRole('list', { name: 'Documents' }).getByRole('button', { name: /^index\.html/ }).click()
  await expect(window.getByRole('region', { name: 'Document view' })).toHaveAttribute('data-ready', 'true')
  const chat = window.getByRole('complementary', { name: 'Chat' })
  return { ...launched, chat, composer: chat.getByRole('textbox', { name: 'Message' }) }
}

test("sending in the Composer runs a Turn: the chat shows the message, the Agent's work and reply, and its edit reloads the Document", async () => {
  const { app, window, chat, composer } = await openEditor({
    turns: [
      [
        { type: 'thinking' },
        { type: 'wait', ms: 600 },
        { type: 'tool', id: 'r', status: 'running', tool: 'read', file: 'index.html' },
        { type: 'tool', id: 'r', status: 'done', tool: 'read', file: 'index.html' },
        { type: 'tool', id: 'e', status: 'running', tool: 'edit', file: 'index.html' },
        { type: 'wait', ms: 300 },
        { type: 'tool', id: 'e', status: 'done', tool: 'edit', file: 'index.html', added: 1, removed: 1, content: '<!doctype html><h1>Big</h1>' },
        { type: 'text', text: 'Done. The heading ' },
        { type: 'text', text: 'is now `big`.' },
      ],
    ],
  })

  await composer.fill('Make the heading bigger')
  await composer.press('Enter')

  await expect(chat.getByText('Make the heading bigger')).toBeVisible()
  await expect(composer).toHaveValue('')
  await expect(chat.getByText('Thinking')).toBeVisible()
  await expect(chat.getByRole('button', { name: 'Queue' })).toBeDisabled()
  await expect(chat.getByRole('group', { name: 'Tool' })).toHaveText([/^Read\s*index\.html$/, /^Edit\s*index\.html\s*\+1\s*−1$/])
  await expect(chat.getByText('Done. The heading is now big.')).toBeVisible()
  await expect(chat.locator('code')).toHaveText('big')
  await expect(chat.getByText('Thinking')).toBeHidden()

  await expect(window.getByText('Reloaded · scroll kept')).toBeVisible()
  await expect.poll(() => inDocument(app, `document.querySelector('h1').textContent`)).toBe('Big')

  await composer.fill('Thanks')
  await expect(chat.getByRole('button', { name: 'Send' })).toBeEnabled()
})

test('a signed-out Claude Code says so, and Sign in again signs in', async () => {
  const { chat, composer } = await openEditor({
    signIn: { result: 'done', ms: 400 },
    turns: [[{ type: 'error', message: 'Your Claude Code login has expired. Sign in again to continue.', reason: 'signed-out' }]],
  })

  await composer.fill('Make the heading bigger')
  await chat.getByRole('button', { name: 'Send' }).click()

  const alert = chat.getByRole('alert')
  await expect(alert).toContainText('Your Claude Code login has expired.')
  await alert.getByRole('button', { name: 'Sign in again' }).click()
  await expect(alert).toContainText('Finish signing in in Terminal')
  await expect(alert).toContainText('Signed in. Send your message again.')
})
