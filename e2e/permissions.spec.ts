import { rm } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { FakeAgentScript } from '../src/main/agent/fake'
import type { PermissionPreset } from '../src/shared/host-api'
import { launchApp, makeFolder, type LaunchedApp } from './app'

let launched: LaunchedApp | undefined
let folder: string | undefined

test.afterEach(async () => {
  await launched?.close()
  if (folder) await rm(folder, { recursive: true, force: true })
})

async function openEditor(agent: FakeAgentScript, preset?: PermissionPreset) {
  folder = await makeFolder({ 'index.html': '<!doctype html><h1>Bakery</h1>' })
  launched = await launchApp({ pickFolder: folder, agent, ...(preset && { preset }) })
  const { window } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()
  await window.getByRole('list', { name: 'Documents' }).getByRole('button', { name: /^index\.html/ }).click()
  const chat = window.getByRole('complementary', { name: 'Chat' })
  const composer = chat.getByRole('textbox', { name: 'Message' })
  const send = async (text: string) => {
    await composer.fill(text)
    await composer.press('Enter')
  }
  return { ...launched, chat, send }
}

const curl = 'curl -o hero.jpg https://example.com/bread.jpg'

test('the Editor preset asks in the chat; Allow once and Deny leave resolved cards', async () => {
  const { chat, send } = await openEditor({
    turns: [
      [
        { type: 'permission', id: 'a1', request: { kind: 'shell', command: curl } },
        { type: 'text', text: 'Downloaded the photo.' },
      ],
      [
        { type: 'permission', id: 'a2', request: { kind: 'write', path: '/etc/hosts', tool: 'Write' } },
        { type: 'text', text: 'Left it alone.' },
      ],
    ],
  })
  await expect(chat.getByRole('status', { name: 'Permission preset' })).toHaveText('Editor')

  await send('Get a real bread photo')
  const card = chat.getByRole('group', { name: 'Approval' })
  await expect(card).toContainText('Claude wants to run a shell command')
  await expect(card).toContainText(curl)
  await card.getByRole('button', { name: 'Allow once' }).click()
  await expect(card).toHaveText(`✓ Allowed once · ${curl}`)
  await expect(card.getByRole('button')).toHaveCount(0)
  await expect(chat.getByText('Downloaded the photo.')).toBeVisible()

  await send('And fix my hosts file')
  const second = chat.getByRole('group', { name: 'Approval' }).nth(1)
  await expect(second).toContainText('Claude wants to go outside the Project')
  await second.getByRole('button', { name: 'Deny' }).click()
  await expect(second).toHaveText('Denied · Write /etc/hosts')
  await expect(chat.getByText('Left it alone.')).toBeVisible()
})

test('Allow everything never asks, and the Composer badge follows the preset', async () => {
  const { window, chat, send } = await openEditor(
    { turns: [[{ type: 'permission', id: 'a1', request: { kind: 'shell', command: curl } }, { type: 'text', text: 'Downloaded the photo.' }]] },
    'allow-everything',
  )
  const badge = chat.getByRole('status', { name: 'Permission preset' })
  await expect(badge).toHaveText('Allow all')

  await send('Get a real bread photo')
  await expect(chat.getByText('Downloaded the photo.')).toBeVisible()
  await expect(chat.getByRole('group', { name: 'Approval' })).toHaveCount(0)

  // The Settings switch is ticket 16; the host API stands in for it.
  await window.evaluate("window.margen.call('permissions.setPreset', 'editor')")
  await expect(badge).toHaveText('Editor')
})
