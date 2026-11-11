import { expect, test } from '@playwright/test'
import { launchApp, type LaunchedApp } from './app'

let launched: LaunchedApp

test.afterEach(async () => {
  await launched?.close()
})

const startHeading = { name: 'Open a project, or start a new one' }

test('a new user installs Claude Code, signs in, and continues to the Start screen', async () => {
  launched = await launchApp({
    agent: {
      detect: { installed: false, signedIn: false },
      install: { result: 'done', version: '2.1.322', ms: 300 },
      signIn: { result: 'done', plan: 'max', ms: 300 },
    },
  })
  const { window } = launched
  const install = window.getByRole('group', { name: 'Claude Code' })
  const signIn = window.getByRole('group', { name: 'Sign in to Claude' })
  const next = window.getByRole('button', { name: 'Continue' })

  await expect(install).toHaveAttribute('data-state', 'missing')
  await expect(install.getByText('Not found on this Mac.')).toBeVisible()
  await expect(signIn.getByRole('button', { name: 'Sign in' })).toBeDisabled()
  await expect(next).toBeDisabled()

  await install.getByRole('button', { name: 'Install' }).click()
  await expect(install).toHaveAttribute('data-state', 'working')
  await expect(install.getByText('Running the official installer…')).toBeVisible()
  await expect(install).toHaveAttribute('data-state', 'done')
  await expect(install.getByText('v2.1.322')).toBeVisible()
  await expect(next).toBeDisabled()

  await signIn.getByRole('button', { name: 'Sign in' }).click()
  await expect(signIn).toHaveAttribute('data-state', 'working')
  await expect(signIn).toHaveAttribute('data-state', 'done')
  await expect(signIn.getByText('Signed in · Claude Max')).toBeVisible()

  await next.click()
  await expect(window.getByRole('heading', startHeading)).toBeVisible()
})

test('a failed Install says so and can be tried again', async () => {
  launched = await launchApp({
    agent: {
      detect: { installed: false, signedIn: false },
      install: { result: 'failed', message: 'curl: (6) Could not resolve host: claude.ai' },
    },
  })
  const install = launched.window.getByRole('group', { name: 'Claude Code' })

  await install.getByRole('button', { name: 'Install' }).click()
  await expect(install).toHaveAttribute('data-state', 'failed')
  await expect(install.getByText('curl: (6) Could not resolve host: claude.ai')).toBeVisible()
  await expect(install.getByRole('button', { name: 'Try again' })).toBeEnabled()
  await expect(launched.window.getByRole('button', { name: 'Continue' })).toBeDisabled()
})

test('installed but signed out starts at the Sign in step', async () => {
  launched = await launchApp({ agent: { detect: { installed: true, version: '2.1.287', signedIn: false } } })
  const { window } = launched

  await expect(window.getByRole('group', { name: 'Claude Code' })).toHaveAttribute('data-state', 'done')
  await expect(window.getByRole('group', { name: 'Sign in to Claude' }).getByRole('button', { name: 'Sign in' })).toBeEnabled()
  await expect(window.getByRole('button', { name: 'Continue' })).toBeDisabled()
})

test('with Claude Code installed and signed in, launch skips straight to the Start screen', async () => {
  launched = await launchApp({ agent: { detect: { installed: true, version: '2.1.287', signedIn: true } } })
  const { window } = launched

  await expect(window.getByRole('heading', startHeading)).toBeVisible()
  await expect(window.getByRole('group', { name: 'Claude Code' })).toHaveCount(0)
})

test('a Sign in that is waiting for Terminal can be cancelled', async () => {
  launched = await launchApp({
    agent: { detect: { installed: true, version: '2.1.287', signedIn: false }, signIn: { result: 'done', ms: 60_000 } },
  })
  const signIn = launched.window.getByRole('group', { name: 'Sign in to Claude' })

  await signIn.getByRole('button', { name: 'Sign in' }).click()
  await expect(signIn).toHaveAttribute('data-state', 'working')
  await signIn.getByRole('button', { name: 'Cancel' }).click()

  await expect(signIn).toHaveAttribute('data-state', 'missing')
  await expect(signIn.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  await expect(launched.window.getByRole('button', { name: 'Continue' })).toBeDisabled()
})
