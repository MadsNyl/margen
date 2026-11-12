import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { inDocument, launchApp, makeFolder, typeInDocument, type LaunchedApp } from './app'

let launched: LaunchedApp | undefined
let folder: string | undefined

test.afterEach(async () => {
  await launched?.close()
  if (folder) await rm(folder, { recursive: true, force: true })
})

const page = `<!doctype html>
<html>
  <body style="margin: 0; padding: 40px; font: 24px sans-serif">
    <h1>Søster</h1>
    <p id="hours">Open 8–16</p>
    <p id="made"></p>
    <script>document.querySelector('#made').textContent = 'Written by a script'</script>
  </body>
</html>
`

async function openEditor() {
  folder = await makeFolder({ 'index.html': page })
  launched = await launchApp({ pickFolder: folder })
  const { window } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()
  await window.getByRole('list', { name: 'Documents' }).getByRole('button', { name: /^index\.html/ }).click()
  await expect(window.getByRole('region', { name: 'Document view' })).toHaveAttribute('data-ready', 'true')
  return launched
}

/** Double-clicks the end of an element's text in the Document view. */
async function doubleClickText(selector: string) {
  if (!launched) throw new Error('No app')
  const { app, window } = launched
  const rect = (await inDocument(
    app,
    `(() => { const range = document.createRange(); range.selectNodeContents(document.querySelector(${JSON.stringify(selector)})); const r = range.getBoundingClientRect(); return { x: r.right - 4, y: r.y + r.height / 2 } })()`,
  )) as { x: number; y: number }
  const frame = await window.getByRole('region', { name: 'Document view' }).boundingBox()
  await window.mouse.dblclick((frame?.x ?? 0) + rect.x, (frame?.y ?? 0) + rect.y)
  await expect.poll(() => inDocument(app, `document.querySelector(${JSON.stringify(selector)}).isContentEditable`)).toBe(true)
}

const file = () => readFile(join(folder ?? '', 'index.html'), 'utf8')

test('double-clicking text in Browse edits it in place: ↵ saves it to the file, Esc puts it back', async () => {
  const { app, window } = await openEditor()

  await doubleClickText('h1')
  await typeInDocument(app, ' Bakery', ['Return'])
  await expect.poll(file).toContain('<h1>Søster Bakery</h1>')
  await expect(window.getByText('Reloaded · scroll kept')).toBeVisible()
  await expect.poll(() => inDocument(app, `document.querySelector('h1').textContent`)).toBe('Søster Bakery')

  await doubleClickText('#hours')
  await typeInDocument(app, ' daily', ['Escape'])
  await expect.poll(() => inDocument(app, `document.querySelector('#hours').textContent`)).toBe('Open 8–16')
  expect(await file()).toContain('<p id="hours">Open 8–16</p>')
})

test("text a script wrote can't be saved by hand: it says so and puts the text back", async () => {
  const { app, window } = await openEditor()

  await doubleClickText('#made')
  await typeInDocument(app, '!', ['Return'])

  await expect(window.getByRole('alert')).toContainText('Not saved: This text isn’t written in the file as shown')
  await expect.poll(() => inDocument(app, `document.querySelector('#made').textContent`)).toBe('Written by a script')
  expect(await file()).toBe(page)
})
