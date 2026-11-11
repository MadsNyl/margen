import { mkdtemp, readFile, rm } from 'node:fs/promises'
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

test('the model and effort chosen last are kept app-wide, in the data directory, across restarts', async () => {
  host = createHost({ dataDir, agent: createFakeAgentProvider() })
  const changes: unknown[] = []
  host.on('model.changed', (choice) => changes.push(choice))
  expect(await host.call('model.choice')).toEqual({})

  expect(await host.call('model.setChoice', { model: 'opus', effort: 'high' })).toEqual({ model: 'opus', effort: 'high' })
  await host.call('model.setChoice', { model: 'sonnet' })
  expect(changes).toEqual([{ model: 'opus', effort: 'high' }, { model: 'sonnet' }])

  host.dispose()
  host = createHost({ dataDir, agent: createFakeAgentProvider() })
  expect(await host.call('model.choice')).toEqual({ model: 'sonnet' })
  expect(JSON.parse(await readFile(join(dataDir, 'model.json'), 'utf8'))).toEqual({ model: 'sonnet' })
})

test('a model choice that is not one is refused', async () => {
  host = createHost({ dataDir, agent: createFakeAgentProvider() })
  await expect(host.call('model.setChoice', { effort: 'extreme' as never })).rejects.toThrow(/Not a model choice/)
  await expect(host.call('model.setChoice', { model: 42 as never })).rejects.toThrow(/Not a model choice/)
  expect(await host.call('model.choice')).toEqual({})
})
