import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, type LaunchedApp } from './app'

let launched: LaunchedApp | undefined
let server: Server | undefined

test.afterEach(async () => {
  await launched?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)))
})

/** A Piper-shaped tar.bz2, served so that it stops half way until `release()`. */
async function serveArchive() {
  const work = await mkdtemp(join(tmpdir(), 'margen-archive-'))
  await mkdir(join(work, 'vits-piper-test'))
  await writeFile(join(work, 'vits-piper-test', 'test.onnx'), randomBytes(512 * 1024))
  await writeFile(join(work, 'vits-piper-test', 'tokens.txt'), 'a 1\n')
  execFileSync('tar', ['-cjf', join(work, 'test.tar.bz2'), '-C', work, 'vits-piper-test'])
  const archive = await readFile(join(work, 'test.tar.bz2'))
  await rm(work, { recursive: true, force: true })

  let release = () => {}
  const released = new Promise<void>((resolve) => (release = resolve))
  const listening = createServer((_request, response) => {
    response.writeHead(200, { 'content-length': archive.length })
    const half = Math.floor(archive.length / 2)
    response.write(archive.subarray(0, half))
    void released.then(() => response.end(archive.subarray(half)))
  })
  server = listening
  await new Promise<void>((resolve) => listening.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(listening.address() as AddressInfo).port}/test.tar.bz2`
  return { archive, url, release }
}

test('Settings → Voices downloads a Voice with progress, previews it and deletes it', async () => {
  const { archive, url, release } = await serveArchive()
  launched = await launchApp({
    voices: [
      {
        id: 'piper-test',
        name: 'Testa, Norwegian',
        engine: 'piper',
        licence: 'MIT engine · CC0 voice',
        url,
        size: archive.length,
        sha256: createHash('sha256').update(archive).digest('hex'),
        folder: 'vits-piper-test',
        files: { model: 'test.onnx', tokens: 'tokens.txt' },
        voices: [{ id: 'piper/test', name: 'Testa', language: 'Norwegian', speaker: 0, espeak: 'nb', sample: 'Hei, dette er Testa.' }],
      },
    ],
  })
  const { window, dataDir } = launched

  await window.getByRole('button', { name: 'Settings' }).click()
  const voices = window.getByRole('dialog', { name: 'Settings' }).getByRole('region', { name: 'Voices' })
  const row = voices.getByRole('group', { name: 'Testa, Norwegian' })
  await expect(row).toContainText('Piper')
  await expect(row).toContainText('MIT engine · CC0 voice')

  await row.getByRole('button', { name: 'Download' }).click()
  const progress = row.getByRole('progressbar', { name: 'Testa, Norwegian download' })
  await expect(progress).toBeVisible()
  await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(40)
  release()

  const preview = row.getByRole('button', { name: 'Preview Testa' })
  await expect(preview).toBeVisible()
  await expect(progress).toHaveCount(0)
  expect((await stat(join(dataDir, 'voices', 'piper-test', 'test.onnx'))).size).toBe(512 * 1024)

  await preview.click()
  const { spoken } = launched
  await expect.poll(async () => (await spoken()).map((line) => line.text)).toEqual(['Hei, dette er Testa.'])

  await row.getByRole('button', { name: 'Delete' }).click()
  await expect(row.getByRole('button', { name: 'Download' })).toBeVisible()
  await expect(stat(join(dataDir, 'voices', 'piper-test'))).rejects.toThrow()
})
