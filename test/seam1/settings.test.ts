import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createFakeAgentProvider } from '../../src/main/agent/fake'
import { createHost, type Host } from '../../src/main/host'

// The preset switch's Seam 1 coverage is in permissions.test.ts.

let dataDir: string
let host: Host | undefined

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'margen-data-'))
})

afterEach(async () => {
  host?.dispose()
  await rm(dataDir, { recursive: true, force: true })
})

test('About shows the version the app was built as', async () => {
  host = createHost({ dataDir, agent: createFakeAgentProvider(), version: '1.0.3' })
  expect(await host.call('app.version')).toBe('1.0.3')
})

test('Settings reads the Agent details from AgentProvider.detect', async () => {
  const detect = { installed: true, path: '/Users/me/.local/bin/claude', version: '2.4.1', signedIn: true, plan: 'Max' }
  host = createHost({ dataDir, agent: createFakeAgentProvider({ detect }) })
  expect(await host.call('agent.detect')).toEqual(detect)
})
