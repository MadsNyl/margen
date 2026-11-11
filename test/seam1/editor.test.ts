import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createHost, type Host } from '../../src/main/host'
import { createFakeAgentProvider } from '../../src/main/agent/fake'

let dataDir: string
let projectDir: string
let host: Host
let opened: string[]

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'margen-data-'))
  projectDir = await mkdtemp(join(tmpdir(), 'margen-project-'))
  opened = []
})

afterEach(async () => {
  host?.dispose()
  await rm(dataDir, { recursive: true, force: true })
  await rm(projectDir, { recursive: true, force: true })
})

async function files(entries: Record<string, string>) {
  for (const [path, content] of Object.entries(entries)) {
    await mkdir(dirname(join(projectDir, path)), { recursive: true })
    await writeFile(join(projectDir, path), content)
  }
}

async function start() {
  host = createHost({ dataDir, agent: createFakeAgentProvider(), openExternal: async (url) => void opened.push(url) })
  await host.call('projects.open', projectDir)
}

/** The file a margen-doc:// URL serves, or `null`. */
const resolve = async (url: string) => (await host.resolveDocumentUrl(url))?.file ?? null

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Collects `document.updated` events until the test reads them. */
function updates() {
  const seen: string[] = []
  host.on('document.updated', ({ path }) => seen.push(path))
  return seen
}

describe('opening a Document', () => {
  test('makes it the current Document and gives a margen-doc URL that serves the file', async () => {
    await files({ 'campaigns/christmas.html': '<h1>Ho ho</h1>', 'campaigns/style.css': 'h1{color:red}' })
    await start()
    const changes: unknown[] = []
    host.on('document.opened', (doc) => changes.push(doc?.path ?? null))

    const doc = await host.call('document.open', 'campaigns/christmas.html')

    expect(doc).toMatchObject({ path: 'campaigns/christmas.html', name: 'christmas.html' })
    expect(doc.url).toMatch(/^margen-doc:\/\/[a-z0-9]+\/campaigns\/christmas\.html$/)
    expect(await host.call('document.current')).toEqual(doc)
    expect(changes).toEqual(['campaigns/christmas.html'])
    expect(await resolve(doc.url)).toBe(join(projectDir, 'campaigns/christmas.html'))
    expect(await resolve(doc.url.replace('christmas.html', 'style.css'))).toBe(join(projectDir, 'campaigns/style.css'))
  })

  test('serves nothing outside the Project folder, or from another Project', async () => {
    await files({ 'index.html': '' })
    await start()
    const { url } = await host.call('document.open', 'index.html')
    const origin = `margen-doc://${new URL(url).host}`

    expect(await resolve(`${origin}/../secret.txt`)).toBe(join(projectDir, 'secret.txt'))
    expect(await resolve(`${origin}/..%2f..%2fetc%2fpasswd`)).toBeNull()
    expect(await resolve('margen-doc://someotherproject/index.html')).toBeNull()
    expect(await resolve('https://example.com/index.html')).toBeNull()
  })

  test('serves nothing a symlink in the Project points at outside it', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'margen-outside-'))
    try {
      await writeFile(join(outside, 'id_rsa'), 'secret')
      await files({ 'index.html': '', 'style.css': '' })
      await symlink(join(outside, 'id_rsa'), join(projectDir, 'key.txt'))
      await symlink(outside, join(projectDir, 'elsewhere'))
      await symlink(join(projectDir, 'style.css'), join(projectDir, 'linked.css'))
      await start()
      const origin = `margen-doc://${new URL((await host.call('document.open', 'index.html')).url).host}`

      expect(await resolve(`${origin}/key.txt`)).toBeNull()
      expect(await resolve(`${origin}/elsewhere/id_rsa`)).toBeNull()
      expect(await resolve(`${origin}/linked.css`)).toBe(join(projectDir, 'linked.css'))
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  test('serves HTML as UTF-8 unless it names its own charset', async () => {
    await files({ 'plain.html': '<h1>Søster</h1>', 'latin.html': '<meta charset="iso-8859-1"><h1>x</h1>', 'style.css': '' })
    await start()
    const { url } = await host.call('document.open', 'plain.html')

    expect(await host.resolveDocumentUrl(url)).toEqual({ file: join(projectDir, 'plain.html'), contentType: 'text/html; charset=utf-8' })
    expect((await host.resolveDocumentUrl(url.replace('plain', 'latin')))?.contentType).toBeUndefined()
    expect((await host.resolveDocumentUrl(url.replace('plain.html', 'style.css')))?.contentType).toBeUndefined()
  })

  test('the same Project always gets the same origin, so the page keeps its localStorage', async () => {
    await files({ 'index.html': '', 'about.html': '' })
    await start()
    const first = new URL((await host.call('document.open', 'index.html')).url).host
    host.dispose()
    await start()

    expect(new URL((await host.call('document.open', 'about.html')).url).host).toBe(first)
  })

  test('rejects a path that is not a Document of the Project', async () => {
    await files({ 'index.html': '', 'notes.md': '' })
    await start()

    await expect(host.call('document.open', 'notes.md')).rejects.toThrow(/not a Document/i)
    await expect(host.call('document.open', '../elsewhere.html')).rejects.toThrow(/not a Document/i)
    expect(await host.call('document.current')).toBeNull()
  })

  test('closing it, or leaving the Project, leaves no current Document', async () => {
    await files({ 'index.html': '' })
    await start()
    const changes: unknown[] = []
    host.on('document.opened', (doc) => changes.push(doc?.path ?? null))

    await host.call('document.open', 'index.html')
    await host.call('document.close')
    await host.call('document.open', 'index.html')
    await host.call('projects.close')

    expect(changes).toEqual(['index.html', null, 'index.html', null])
    expect(await host.call('document.current')).toBeNull()
  })

  test('"Open in browser" opens the file itself in the default browser', async () => {
    await files({ 'pages/menu.html': '' })
    await start()
    await host.call('document.open', 'pages/menu.html')

    await host.call('document.openInBrowser')

    expect(opened).toEqual([pathToFileURL(join(projectDir, 'pages/menu.html')).href])
  })
})

describe('live reload', () => {
  test('several quick writes to the Document cause one update', async () => {
    await files({ 'index.html': '<h1>1</h1>' })
    await start()
    await host.call('document.open', 'index.html')
    const seen = updates()

    for (let i = 2; i <= 6; i++) {
      await writeFile(join(projectDir, 'index.html'), `<h1>${i}</h1>`)
      await sleep(30)
    }
    await sleep(700)

    expect(seen).toEqual(['index.html'])
    await writeFile(join(projectDir, 'index.html'), '<h1>7</h1>')
    await sleep(700)
    expect(seen).toEqual(['index.html', 'index.html'])
  })

  test("a change to the page's stylesheet or images reloads it too, another Document does not", async () => {
    await files({ 'index.html': '', 'about.html': '', 'css/site.css': '' })
    await start()
    await host.call('document.open', 'index.html')
    const seen = updates()

    await writeFile(join(projectDir, 'about.html'), '<p>other page</p>')
    await sleep(600)
    expect(seen).toEqual([])

    await writeFile(join(projectDir, 'css/site.css'), 'body{margin:0}')
    await sleep(600)
    expect(seen).toEqual(['index.html'])
  })

  test('stops once the Document is closed', async () => {
    await files({ 'index.html': '' })
    await start()
    await host.call('document.open', 'index.html')
    const seen = updates()
    await host.call('document.close')

    await writeFile(join(projectDir, 'index.html'), '<p>later</p>')
    await sleep(600)
    expect(seen).toEqual([])
  })

  test('Margen never writes to the Document', async () => {
    const html = '<!doctype html><html><head><title>Mine</title></head><body><p>Hands off</p></body></html>'
    await files({ 'index.html': html })
    await start()
    await host.call('document.open', 'index.html')
    await host.call('document.openInBrowser')
    await host.call('document.close')

    expect(await readFile(join(projectDir, 'index.html'), 'utf8')).toBe(html)
  })
})
