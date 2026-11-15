import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { inDocument, launchApp, makeFolder, typeInDocument, type LaunchedApp } from './app'

let launched: LaunchedApp | undefined
let folder: string | undefined

test.afterEach(async () => {
  await launched?.close()
  if (folder) await rm(folder, { recursive: true, force: true })
})

/** Makes a Document from a Template card, as the user would, and waits for it to open. */
async function fromCard(window: Page, template: 'Poster' | 'Slides', name: string) {
  await window.getByRole('button', { name: /Open a folder/ }).click()
  await window.getByRole('list', { name: 'Templates' }).getByRole('button', { name: new RegExp(`^${template}`) }).click()
  const dialog = window.getByRole('dialog', { name: template })
  await dialog.getByRole('textbox', { name: 'Describe the new Document' }).fill(`A ${template.toLowerCase()}`)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(window.getByRole('button', { name: 'Switch document' })).toHaveText(new RegExp(`${name}\\.html`))
}

/** The PDF's pages and the size of the first, in points. */
function pdfPages(pdf: Buffer) {
  const text = pdf.toString('latin1')
  const box = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/.exec(text)
  return { pages: text.match(/\/Type\s*\/Page\b/g)?.length ?? 0, width: Number(box?.[1]), height: Number(box?.[2]) }
}

async function exportPdf(window: Page) {
  await window.getByRole('button', { name: 'Export' }).click()
  await window.getByRole('menuitem', { name: 'PDF' }).click()
}

test('Slides fill a whole 16:9 view, step with the keys, keep the slide on reload and export to PDF one slide per page', async () => {
  folder = await makeFolder({ 'index.html': '<h1>Home</h1>' })
  const saveFile = join(folder, 'pitch.pdf')
  launched = await launchApp({ pickFolder: folder, saveFile, agent: { documentName: 'pitch', turns: [[{ type: 'text', text: 'Here it is.' }]] } })
  const { app, window } = launched
  await fromCard(window, 'Slides', 'pitch')
  // No Viewport choice: the deck is shown at the slide size, fitted.
  await expect(window.getByRole('button', { name: /Viewport/ })).toBeHidden()
  const view = window.getByRole('region', { name: 'Document view' })
  await expect(view).toHaveAttribute('data-fit', 'true')
  const box = await view.boundingBox()
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(16 / 9, 1)

  // As the Agent would: three slides in place of the starting one.
  const file = join(folder, 'pitch.html')
  const slides = [1, 2, 3].map((n) => `<section class="slide"><h1>Slide ${n}</h1></section>`).join('\n')
  await writeFile(file, (await readFile(file, 'utf8')).replace('<section class="slide current"></section>', slides))
  await expect.poll(() => inDocument(app, `document.querySelectorAll('.slide').length`)).toBe(3)
  await expect(view).toHaveAttribute('data-ready', 'true')
  const current = () => inDocument(app, `[location.hash, document.querySelector('.slide.current h1')?.textContent, getComputedStyle(document.querySelector('.slide.current'), '::after').content]`)
  expect(await current()).toEqual(['', 'Slide 1', 'counter(slide)'])
  expect(await inDocument(app, `[...document.querySelectorAll('.slide')].map((s) => getComputedStyle(s).visibility)`)).toEqual(['visible', 'hidden', 'hidden'])

  await typeInDocument(app, '', ['Right'])
  await expect.poll(current).toEqual(['#2', 'Slide 2', 'counter(slide)'])
  await typeInDocument(app, '', ['Space'])
  await expect.poll(current).toEqual(['#3', 'Slide 3', 'counter(slide)'])
  await typeInDocument(app, '', ['Enter'])
  await typeInDocument(app, '', ['Left'])
  await expect.poll(current).toEqual(['#2', 'Slide 2', 'counter(slide)'])

  // An edit reloads the deck on the slide it was showing.
  await writeFile(file, (await readFile(file, 'utf8')).replace('Slide 2', 'Second'))
  await expect.poll(current).toEqual(['#2', 'Second', 'counter(slide)'])

  await exportPdf(window)
  await expect(window.getByRole('status').filter({ hasText: 'Exported pitch.pdf' })).toBeVisible({ timeout: 15_000 })
  // 13.33 × 7.5 in: 960 × 540 pt.
  expect(pdfPages(await readFile(saveFile))).toEqual({ pages: 3, width: 960, height: 540 })
})

test('a Poster is shown as a whole A4 sheet and exports to PDF as one A4 page', async () => {
  folder = await makeFolder({ 'index.html': '<h1>Home</h1>' })
  const saveFile = join(folder, 'bake-sale.pdf')
  launched = await launchApp({ pickFolder: folder, saveFile, agent: { documentName: 'bake-sale', turns: [[{ type: 'text', text: 'Here it is.' }]] } })
  const { window } = launched
  await fromCard(window, 'Poster', 'bake-sale')

  const view = window.getByRole('region', { name: 'Document view' })
  await expect(view).toHaveAttribute('data-fit', 'true')
  const box = await view.boundingBox()
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(210 / 297, 2)

  await exportPdf(window)
  await expect(window.getByRole('status').filter({ hasText: 'Exported bake-sale.pdf' })).toBeVisible({ timeout: 15_000 })
  const { pages, width, height } = pdfPages(await readFile(saveFile))
  expect(pages).toBe(1)
  // A4 (210 × 297 mm), as Chromium rounds it: about 596 × 843 pt.
  expect(width).toBeCloseTo(596, 0)
  expect(height).toBeCloseTo(843, 0)
})
