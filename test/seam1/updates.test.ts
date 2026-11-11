import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { UpdateStatus } from '@shared/host-api'
import { createHost, type Host } from '../../src/main/host'
import { createFakeAgentProvider } from '../../src/main/agent/fake'
import type { UpdateSource } from '../../src/main/updates'

let dataDir: string
let host: Host

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'margen-data-'))
})

afterEach(async () => {
  host?.dispose()
  await rm(dataDir, { recursive: true, force: true })
})

/** A stand-in for GitHub Releases: `latest` is the newest published version, or null for none newer. */
function fakeSource(latest: string | null, opts: { failWith?: string } = {}) {
  const calls: string[] = []
  const source: UpdateSource = {
    async check() {
      calls.push('check')
      if (opts.failWith) throw new Error(opts.failWith)
      return latest ? { version: latest } : null
    },
    async download() {
      calls.push('download')
    },
    install() {
      calls.push('install')
    },
  }
  return { source, calls }
}

function start(updates?: UpdateSource) {
  host = createHost({ dataDir, agent: createFakeAgentProvider(), updates })
  const statuses: UpdateStatus[] = []
  host.on('update.changed', (status) => statuses.push(status))
  return statuses
}

describe('auto-update', () => {
  test('a build without an update source (dev, tests) says updates are unavailable', async () => {
    start()
    expect(await host.call('update.status')).toEqual({ state: 'unavailable' })
    expect(await host.call('update.check')).toEqual({ state: 'unavailable' })
  })

  test('before the first check nothing is known', async () => {
    start(fakeSource(null).source)
    expect(await host.call('update.status')).toEqual({ state: 'idle' })
  })

  test('no newer release leaves the app up to date', async () => {
    const statuses = start(fakeSource(null).source)
    expect(await host.call('update.check')).toEqual({ state: 'up-to-date' })
    expect(statuses).toEqual([{ state: 'checking' }, { state: 'up-to-date' }])
  })

  test('a newer release is downloaded and then ready to install', async () => {
    const { source, calls } = fakeSource('0.2.0')
    const statuses = start(source)

    expect(await host.call('update.check')).toEqual({ state: 'ready', version: '0.2.0' })

    expect(calls).toEqual(['check', 'download'])
    expect(statuses).toEqual([
      { state: 'checking' },
      { state: 'downloading', version: '0.2.0' },
      { state: 'ready', version: '0.2.0' },
    ])
    expect(await host.call('update.status')).toEqual({ state: 'ready', version: '0.2.0' })
  })

  test('a failed check is reported, not thrown', async () => {
    const statuses = start(fakeSource(null, { failWith: 'offline' }).source)
    expect(await host.call('update.check')).toEqual({ state: 'failed', message: 'offline' })
    expect(statuses.at(-1)).toEqual({ state: 'failed', message: 'offline' })
  })

  test('once an update is ready, checking again does not download it twice', async () => {
    const { source, calls } = fakeSource('0.2.0')
    start(source)
    await host.call('update.check')
    await host.call('update.check')
    expect(calls).toEqual(['check', 'download'])
  })

  test('installing restarts into a ready update', async () => {
    const { source, calls } = fakeSource('0.2.0')
    start(source)
    await host.call('update.check')
    await host.call('update.install')
    expect(calls.at(-1)).toBe('install')
  })

  test('installing with nothing ready is refused', async () => {
    const { source, calls } = fakeSource(null)
    start(source)
    await expect(host.call('update.install')).rejects.toThrow('No update is ready')
    expect(calls).not.toContain('install')
  })
})
