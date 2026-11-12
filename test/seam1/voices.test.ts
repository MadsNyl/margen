import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { VoicePack } from '@shared/voices'
import { createFakeAgentProvider } from '../../src/main/agent/fake'
import { createHost, type Host } from '../../src/main/host'
import type { VoicePackEntry } from '../../src/main/voices/catalogue'
import { createFakeSynthesiser } from '../../src/main/voices/fake'

let dataDir: string
let host: Host
let server: Server | undefined

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'margen-data-'))
})

afterEach(async () => {
  host?.dispose()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)))
  server = undefined
  await rm(dataDir, { recursive: true, force: true })
})

/** A Piper-shaped download: `vits-piper-test/` holding a model and its tokens, as a tar.bz2 like sherpa-onnx's releases. */
async function makeArchive(): Promise<Buffer> {
  const work = await mkdtemp(join(tmpdir(), 'margen-archive-'))
  await mkdir(join(work, 'vits-piper-test'))
  // Big enough (and not compressible) that a download reports progress along the way.
  await writeFile(join(work, 'vits-piper-test', 'test.onnx'), randomBytes(256 * 1024))
  await writeFile(join(work, 'vits-piper-test', 'tokens.txt'), 'a 1\n')
  execFileSync('tar', ['-cjf', join(work, 'test.tar.bz2'), '-C', work, 'vits-piper-test'])
  const archive = await readFile(join(work, 'test.tar.bz2'))
  await rm(work, { recursive: true, force: true })
  return archive
}

interface Served {
  url: string
  /** The Range header of each request, `null` without one. */
  ranges: (string | null)[]
}

/**
 * sherpa-onnx's model releases, served locally. Honours Range, sends in small
 * chunks, and with `dropAfter` cuts the first response off after that many bytes.
 */
async function serve(archive: Buffer, opts: { dropAfter?: number } = {}): Promise<Served> {
  const ranges: (string | null)[] = []
  const listening = createServer((request, response) => {
    ranges.push(request.headers.range ?? null)
    const from = Number(/bytes=(\d+)-/.exec(request.headers.range ?? '')?.[1] ?? 0)
    const body = archive.subarray(from)
    response.writeHead(from ? 206 : 200, {
      'content-length': body.length,
      ...(from && { 'content-range': `bytes ${from}-${archive.length - 1}/${archive.length}` }),
    })
    const drop = ranges.length === 1 ? opts.dropAfter : undefined
    let sent = 0
    const next = () => {
      if (drop !== undefined && sent >= drop) return response.destroy()
      if (sent >= body.length) return response.end()
      const chunk = body.subarray(sent, sent + 16 * 1024)
      sent += chunk.length
      response.write(chunk, () => setTimeout(next, 1))
    }
    next()
  })
  server = listening
  await new Promise<void>((resolve) => listening.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${(listening.address() as AddressInfo).port}/test.tar.bz2`, ranges }
}

function pack(url: string, archive: Buffer, extra: Partial<VoicePackEntry> = {}): VoicePackEntry {
  return {
    id: 'piper-test',
    name: 'Test',
    engine: 'piper',
    licence: 'MIT engine · CC0 voice',
    url,
    size: archive.length,
    sha256: createHash('sha256').update(archive).digest('hex'),
    folder: 'vits-piper-test',
    files: { model: 'test.onnx', tokens: 'tokens.txt' },
    voices: [{ id: 'piper/test', name: 'Testa', language: 'Norwegian', speaker: 0, espeak: 'nb', sample: 'Hei, dette er Testa.' }],
    ...extra,
  }
}

function makeHost(catalogue: VoicePackEntry[], synthesiser = createFakeSynthesiser()) {
  host = createHost({ dataDir, agent: createFakeAgentProvider(), voices: { catalogue, synthesiser } })
  return host
}

test('Settings lists every Voice download in the catalogue with its size and licence, none on this Mac yet', async () => {
  const archive = await makeArchive()
  makeHost([pack('http://127.0.0.1:1/unused', archive)])
  expect(await host.call('voices.list')).toEqual<VoicePack[]>([
    {
      id: 'piper-test',
      name: 'Test',
      engine: 'piper',
      licence: 'MIT engine · CC0 voice',
      size: archive.length,
      voices: [{ id: 'piper/test', name: 'Testa', language: 'Norwegian' }],
      state: { state: 'available' },
    },
  ])
})

test('a download reports progress, unpacks into the data directory and leaves the Voice installed across restarts', async () => {
  const archive = await makeArchive()
  const served = await serve(archive)
  makeHost([pack(served.url, archive)])
  const states: (VoicePack['state'] | undefined)[] = []
  host.on('voices.changed', (packs) => states.push(packs[0]?.state))

  await host.call('voices.download', 'piper-test')

  const progress = states.flatMap((s) => (s?.state === 'downloading' ? [s.received] : []))
  expect(progress.length).toBeGreaterThan(1)
  expect(progress).toEqual([...progress].sort((a, b) => a - b))
  expect(progress.at(-1)).toBeLessThanOrEqual(archive.length)
  expect(states.at(-1)).toEqual({ state: 'installed' })
  expect(await readFile(join(dataDir, 'voices', 'piper-test', 'tokens.txt'), 'utf8')).toBe('a 1\n')

  host.dispose()
  makeHost([pack(served.url, archive)])
  expect((await host.call('voices.list'))[0]?.state).toEqual({ state: 'installed' })
})

test('a download cut off part way fails, and the next one asks only for the rest', async () => {
  const archive = await makeArchive()
  const served = await serve(archive, { dropAfter: 64 * 1024 })
  makeHost([pack(served.url, archive)])

  await expect(host.call('voices.download', 'piper-test')).rejects.toThrow()
  expect((await host.call('voices.list'))[0]?.state).toMatchObject({ state: 'failed' })

  await host.call('voices.download', 'piper-test')
  expect(served.ranges).toHaveLength(2)
  expect(served.ranges[0]).toBeNull()
  const resumedFrom = Number(/^bytes=(\d+)-$/.exec(served.ranges[1] ?? '')?.[1])
  expect(resumedFrom).toBeGreaterThan(0)
  expect(resumedFrom).toBeLessThanOrEqual(64 * 1024)
  expect((await host.call('voices.list'))[0]?.state).toEqual({ state: 'installed' })
})

test('a download whose checksum does not match is thrown away and nothing is installed', async () => {
  const archive = await makeArchive()
  const served = await serve(archive)
  makeHost([pack(served.url, archive, { sha256: '0'.repeat(64) })])

  await expect(host.call('voices.download', 'piper-test')).rejects.toThrow(/checksum/)
  expect((await host.call('voices.list'))[0]?.state).toEqual({ state: 'failed', message: expect.stringMatching(/checksum/) })
  await expect(readFile(join(dataDir, 'voices', 'piper-test', 'tokens.txt'))).rejects.toThrow()

  // Nothing partial is kept to resume from: the next try starts over.
  await expect(host.call('voices.download', 'piper-test')).rejects.toThrow(/checksum/)
  expect(served.ranges).toEqual([null, null])
})

test('deleting a Voice removes it from this Mac', async () => {
  const archive = await makeArchive()
  const served = await serve(archive)
  makeHost([pack(served.url, archive)])
  await host.call('voices.download', 'piper-test')
  const changes: (VoicePack['state'] | undefined)[] = []
  host.on('voices.changed', (packs) => changes.push(packs[0]?.state))

  await host.call('voices.delete', 'piper-test')
  expect(changes).toEqual([{ state: 'available' }])
  expect((await host.call('voices.list'))[0]?.state).toEqual({ state: 'available' })
  await expect(readFile(join(dataDir, 'voices', 'piper-test', 'tokens.txt'))).rejects.toThrow()
})

/** A WAV header's fields: RIFF/WAVE, PCM, channels, sample rate, bits, and the data size. */
function wavHeader(wav: Uint8Array) {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const text = (at: number) => String.fromCharCode(...wav.subarray(at, at + 4))
  return {
    riff: text(0),
    wave: text(8),
    format: view.getUint16(20, true),
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bits: view.getUint16(34, true),
    data: text(36),
    dataBytes: view.getUint32(40, true),
  }
}

test('previewing an installed Voice speaks its sample sentence with its model, as a WAV and its length', async () => {
  const archive = await makeArchive()
  const served = await serve(archive)
  const synthesiser = createFakeSynthesiser()
  makeHost([pack(served.url, archive)], synthesiser)
  await host.call('voices.download', 'piper-test')

  const audio = await host.call('voices.preview', 'piper/test')

  const installed = join(dataDir, 'voices', 'piper-test')
  expect(synthesiser.spoken).toEqual([
    {
      engine: 'piper',
      model: join(installed, 'test.onnx'),
      tokens: join(installed, 'tokens.txt'),
      speaker: 0,
      espeak: 'nb',
      text: 'Hei, dette er Testa.',
    },
  ])
  // The fake speaks a tenth of a second per word at 22050 Hz: 4 words.
  expect(audio.duration).toBeCloseTo(0.4, 5)
  expect(wavHeader(audio.wav)).toEqual({
    riff: 'RIFF',
    wave: 'WAVE',
    format: 1,
    channels: 1,
    sampleRate: 22050,
    bits: 16,
    data: 'data',
    dataBytes: 8820 * 2,
  })
  expect(audio.wav.length).toBe(44 + 8820 * 2)
})

test('a Voice that is not on this Mac, or not a Voice at all, is not spoken', async () => {
  const archive = await makeArchive()
  makeHost([pack('http://127.0.0.1:1/unused', archive)])
  await expect(host.call('voices.preview', 'piper/test')).rejects.toThrow(/not on this Mac/)
  await expect(host.call('voices.preview', 'piper/nobody')).rejects.toThrow(/Not a Voice/)
  await expect(host.call('voices.delete', 'nothing')).rejects.toThrow(/Not a Voice download/)
})
