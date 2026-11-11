import { readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { inDocument, launchApp, makeFolder, type LaunchedApp } from './app'

let launched: LaunchedApp | undefined
let folder: string | undefined

test.afterEach(async () => {
  await launched?.close()
  if (folder) await rm(folder, { recursive: true, force: true })
})

/**
 * A tall page that counts its own loads (sessionStorage survives a reload) and uses
 * localStorage. It turns off the browser's own scroll restoration, so only Margen's counts.
 */
const page = (title: string) => `<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="style.css">
    <script>
      history.scrollRestoration = 'manual'
      sessionStorage.loads = String(Number(sessionStorage.loads || 0) + 1)
      localStorage.visits = String(Number(localStorage.visits || 0) + 1)
    </script>
  </head>
  <body>
    <h1>${title}</h1>
    <p>Søster bakery</p>
    <div style="height: 4000px"></div>
    <p>The end</p>
  </body>
</html>
`

async function openEditor(files: Record<string, string>, document: RegExp) {
  folder = await makeFolder(files)
  launched = await launchApp({ pickFolder: folder })
  const { window } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()
  await window.getByRole('list', { name: 'Documents' }).getByRole('button', { name: document }).click()
  await expect(window.getByRole('region', { name: 'Document view' })).toHaveAttribute('data-ready', 'true')
  return launched
}

test("clicking a Document opens it in the editor, sandboxed, with its own scripts and styles, and the file untouched", async () => {
  const html = page('Version 1')
  const { app, window } = await openEditor({ 'index.html': html, 'style.css': 'h1 { color: rgb(255, 0, 0) }' }, /^index\.html/)
  const project = basename(folder ?? '')

  await expect(window.getByRole('button', { name: 'Back to Start' })).toBeVisible()
  await expect(window.getByRole('button', { name: project, exact: true })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Switch document' })).toHaveText(/index\.html/)
  await expect(window.getByRole('button', { name: 'Open in browser' })).toBeVisible()
  await expect(window.getByRole('complementary', { name: 'Chat' })).toBeVisible()

  expect(await inDocument(app, `document.querySelector('h1').textContent`)).toBe('Version 1')
  // No <meta charset>: served as UTF-8 all the same.
  expect(await inDocument(app, `document.querySelector('p').textContent`)).toBe('Søster bakery')
  expect(await inDocument(app, `getComputedStyle(document.querySelector('h1')).color`)).toBe('rgb(255, 0, 0)')
  expect(await inDocument(app, `[sessionStorage.loads, localStorage.visits]`)).toEqual(['1', '1'])
  // No Node in the page, and Margen's own script and the host API stay out of the page's reach.
  expect(await inDocument(app, `[typeof require, typeof process, typeof window.margen]`)).toEqual(['undefined', 'undefined', 'undefined'])
  expect(await inDocument(app, `document.documentElement.outerHTML.includes('margen')`)).toBe(false)
  expect(await readFile(join(folder ?? '', 'index.html'), 'utf8')).toBe(html)
})

test('several quick writes reload the Document once, keep the scroll position and say so', async () => {
  const { app, window } = await openEditor({ 'index.html': page('Version 1'), 'style.css': '' }, /^index\.html/)
  await inDocument(app, 'scrollTo(0, 1500)')
  await expect.poll(() => inDocument(app, 'scrollY')).toBe(1500)
  // Give the injected script a moment to report where the page is scrolled to.
  await window.waitForTimeout(300)

  for (let version = 2; version <= 5; version++) {
    await writeFile(join(folder ?? '', 'index.html'), page(`Version ${version}`))
    await window.waitForTimeout(40)
  }

  await expect(window.getByText('Reloaded · scroll kept')).toBeVisible()
  await expect.poll(() => inDocument(app, `document.querySelector('h1').textContent`)).toBe('Version 5')
  await expect.poll(() => inDocument(app, 'scrollY')).toBe(1500)
  await window.waitForTimeout(700)
  expect(await inDocument(app, 'sessionStorage.loads')).toBe('2')
})

test("the breadcrumb lists the Project's Documents and switches between them, and leads back to the Project", async () => {
  const { app, window } = await openEditor(
    { 'index.html': page('Home'), 'pages/about.html': '<h1>About</h1>', 'notes.md': '' },
    /^index\.html/,
  )

  await window.getByRole('button', { name: 'Switch document' }).click()
  const menu = window.getByRole('menu')
  await expect(menu.getByRole('menuitem')).toHaveText([/index\.html/, /about\.html\s*pages\//])
  await menu.getByRole('menuitem', { name: /about\.html/ }).click()

  await expect(window.getByRole('button', { name: 'Switch document' })).toHaveText(/about\.html/)
  await expect(window.getByRole('region', { name: 'Document view' })).toHaveAttribute('data-ready', 'true')
  await expect.poll(() => inDocument(app, `document.querySelector('h1').textContent`)).toBe('About')

  await window.getByRole('button', { name: basename(folder ?? ''), exact: true }).click()
  await expect(window.getByRole('heading', { name: /Let us build/ })).toBeVisible()
})

test('the Viewport select shows the live width, fits the window on Desktop and switches to Mobile at 390px', async () => {
  const { app, window } = await openEditor({ 'index.html': page('Version 1'), 'style.css': '' }, /^index\.html/)
  const select = window.getByRole('button', { name: 'Viewport' })
  const frame = window.getByRole('region', { name: 'Document view' })
  const frameWidth = () => frame.evaluate((el) => Math.round(el.getBoundingClientRect().width))

  // Desktop fits the window, and the select shows the width the page really gets.
  await expect(select).toHaveText(/Desktop/)
  const desktop = await frameWidth()
  await expect.poll(() => inDocument(app, 'innerWidth')).toBe(desktop)
  await expect(select).toHaveText(new RegExp(`${desktop}px`))

  // Resizing the window resizes Desktop and the width shown with it.
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    const [width = 0, height = 0] = win?.getSize() ?? []
    win?.setSize(width - 100, height)
  })
  await expect.poll(frameWidth).toBe(desktop - 100)
  await expect(select).toHaveText(new RegExp(`${desktop - 100}px`))

  await select.click()
  await window.getByRole('menuitem', { name: /Mobile/ }).click()
  await expect(select).toHaveText(/Mobile/)
  await expect.poll(() => inDocument(app, 'innerWidth')).toBe(390)
  await expect(select).toHaveText(/390px/)

  await select.click()
  await window.getByRole('menuitem', { name: /Tablet/ }).click()
  await expect.poll(() => inDocument(app, 'innerWidth')).toBe(820)
  await expect(select).toHaveText(/Tablet.*820px/)
})
