import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createHost, type Host } from '../../src/main/host'
import { createFakeAgentProvider } from '../../src/main/agent/fake'

let dataDir: string
let host: Host

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'margen-data-'))
})

afterEach(async () => {
  host?.dispose()
  await rm(dataDir, { recursive: true, force: true })
})

const recent = { path: '/Users/me/Sites/studio', name: 'studio', openedAt: '2026-11-10T09:00:00.000Z' }

describe('recent Projects', () => {
  test('a fresh data directory has no recent Projects', async () => {
    host = createHost({ dataDir, agent: createFakeAgentProvider() })
    expect(await host.call('recents.list')).toEqual([])
  })

  test('lists the recent Projects stored in the data directory', async () => {
    await writeFile(join(dataDir, 'recents.json'), JSON.stringify([recent]))
    host = createHost({ dataDir, agent: createFakeAgentProvider() })
    expect(await host.call('recents.list')).toEqual([recent])
  })

  test('clearing empties the list, tells listeners and survives a restart', async () => {
    await writeFile(join(dataDir, 'recents.json'), JSON.stringify([recent]))
    host = createHost({ dataDir, agent: createFakeAgentProvider() })
    const changes: unknown[] = []
    host.on('recents.changed', (recents) => changes.push(recents))

    await host.call('recents.clear')

    expect(changes).toEqual([[]])
    host.dispose()
    host = createHost({ dataDir, agent: createFakeAgentProvider() })
    expect(await host.call('recents.list')).toEqual([])
  })
})
