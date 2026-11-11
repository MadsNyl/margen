import { rm } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { DrawAnnotation } from '../src/shared/agent'
import { inDocument, launchApp, makeFolder, type LaunchedApp } from './app'

let launched: LaunchedApp | undefined
let folder: string | undefined

test.afterEach(async () => {
  await launched?.close()
  if (folder) await rm(folder, { recursive: true, force: true })
})

/** A menu page: a heading, a section with a grid of three cards, then empty space. */
const page = `<!doctype html>
<html>
  <body style="margin: 0; padding: 40px; font: 16px sans-serif">
    <main>
      <h1>Søster</h1>
      <section class="menu" style="padding: 60px 0">
        <h2>Menu</h2>
        <div class="grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px">
          <div class="card" style="height: 110px; background: #f3efe6">Bun</div>
          <div class="card" style="height: 110px; background: #f3efe6">Loaf</div>
          <div class="card" style="height: 110px; background: #f3efe6">Tart</div>
        </div>
      </section>
      <div class="space" style="height: 420px"></div>
    </main>
  </body>
</html>
`

async function openEditor() {
  folder = await makeFolder({ 'index.html': page })
  launched = await launchApp({ pickFolder: folder, agent: { turns: [[{ type: 'text', text: 'Done.' }]] } })
  const { window, app } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()
  await window.getByRole('list', { name: 'Documents' }).getByRole('button', { name: /^index\.html/ }).click()
  const frame = window.getByRole('region', { name: 'Document view' })
  await expect(frame).toHaveAttribute('data-ready', 'true')
  const toolbar = window.getByRole('toolbar', { name: 'Mode' })
  await window.keyboard.press('d')
  await expect(toolbar.getByRole('button', { name: 'Draw' })).toHaveAttribute('aria-pressed', 'true')
  // A new Mode reaches the page a moment after the toolbar shows it: wait for the page's pen.
  await expect.poll(() => inDocument(app, `getComputedStyle(document.querySelector('.grid')).cursor`)).toContain('url(')
  return { ...launched, frame, chat: window.getByRole('complementary', { name: 'Chat' }) }
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** An element's box in the page's viewport. */
async function rectOf(selector: string): Promise<Rect> {
  if (!launched) throw new Error('No app')
  return (await inDocument(
    launched.app,
    `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })()`,
  )) as Rect
}

/** A patch of the empty space under the grid, well inside the view and to the right of a comment box under the grid. */
async function emptySpace(): Promise<Rect> {
  const space = await rectOf('.space')
  return { x: space.x + space.width - 260, y: space.y + 24, width: 220, height: 70 }
}

/**
 * Draws a loop round `rect` (in the page's viewport) with real mouse input,
 * `margin` px outside it. `during` runs with the button still down.
 */
async function circle(rect: Rect, margin: number, during?: () => Promise<void>) {
  if (!launched) throw new Error('No app')
  const { window } = launched
  const frame = await window.getByRole('region', { name: 'Document view' }).boundingBox()
  const cx = (frame?.x ?? 0) + rect.x + rect.width / 2
  const cy = (frame?.y ?? 0) + rect.y + rect.height / 2
  const rx = rect.width / 2 + margin
  const ry = rect.height / 2 + margin
  const at = (i: number) => ({ x: cx + rx * Math.cos((i / 36) * 2 * Math.PI), y: cy + ry * Math.sin((i / 36) * 2 * Math.PI) })
  await window.mouse.move(at(0).x, at(0).y)
  await window.mouse.down()
  for (let i = 1; i <= 36; i++) await window.mouse.move(at(i).x, at(i).y, { steps: 2 })
  await during?.()
  await window.mouse.up()
}

test('circling the card grid lights it up and resolves to the grid; a second stroke joins the same drawing, and the Agent gets its screenshots', async () => {
  const { window, frame, chat, sentTurns } = await openEditor()
  const grid = await rectOf('.grid')

  // A just-loaded Document view can miss the first input, so draw again until the drawing lands.
  const box = window.getByRole('dialog', { name: 'Annotation 1' })
  await expect(async () => {
    await circle(grid, 16, async () => {
      // While drawing, what the stroke encloses lights up.
      await expect(frame.locator('[data-live]')).toHaveCount(1, { timeout: 1000 })
    })
    await expect(box).toBeVisible({ timeout: 1000 })
  }).toPass()
  await expect(frame.locator('[data-live]')).toHaveCount(0)
  await expect(box.getByText('Drawing', { exact: true })).toBeVisible()
  await expect(box.getByRole('list', { name: 'Caught' }).getByRole('listitem')).toHaveText(['section.menu › div.grid'])
  const comment = box.getByRole('textbox', { name: 'Comment' })
  await expect(comment).toBeFocused()
  await window.keyboard.type('Tighten these')

  // A second stroke, on empty space, joins the open drawing; typing carries on in its comment box.
  await circle(await emptySpace(), 0)
  await expect(window.getByRole('dialog', { name: 'Annotation 2' })).toHaveCount(0)
  await expect(frame.locator('[data-strokes] path')).toHaveCount(2)
  await expect(comment).toBeFocused()
  await window.keyboard.type(' and add a stamp below')
  await expect(box.getByRole('list', { name: 'Caught' }).getByRole('listitem')).toHaveText(['section.menu › div.grid'])
  const chips = chat.getByRole('list', { name: 'Annotations' })
  await expect(chips.getByRole('listitem')).toHaveText([/1\s*✎ section\.menu › div\.grid\s*Tighten these and add a stamp below/])

  await comment.press('Enter')
  await expect.poll(async () => (await sentTurns()).length).toBe(1)
  const [turn] = await sentTurns()
  const drawing = turn?.annotations[0] as DrawAnnotation
  expect(turn?.annotations).toHaveLength(1)
  expect(drawing).toMatchObject({
    kind: 'draw',
    number: 1,
    comment: 'Tighten these and add a stamp below',
    targets: [{ selector: 'section.menu > div.grid', tag: 'div' }],
  })
  expect(drawing.strokes).toHaveLength(2)
  // The strokes' box holds the grid, in page coordinates.
  expect(drawing.boundingBox.x).toBeLessThan(grid.x)
  expect(drawing.boundingBox.y).toBeLessThan(grid.y)
  expect(drawing.screenshot).toMatch(/^data:image\/png;base64,/)
  expect(drawing.crop).toMatch(/^data:image\/png;base64,/)

  // The chat keeps the drawing, with its thumbnail.
  const row = chat.getByRole('listitem', { name: 'Annotation 1' })
  await expect(row).toHaveText(/drawing · section\.menu › div\.grid · \d+px\s*Tighten these/)
  await expect(row.locator('img')).toHaveAttribute('src', /^data:image\/png/)
})

test('drawing on empty space resolves to nothing, and is still sent with where it is', async () => {
  const { window, sentTurns } = await openEditor()
  const space = await emptySpace()

  const box = window.getByRole('dialog', { name: 'Annotation 1' })
  await expect(async () => {
    await circle(space, 0)
    await expect(box).toBeVisible({ timeout: 1000 })
  }).toPass()
  await expect(box.getByRole('list', { name: 'Caught' }).getByRole('listitem')).toHaveText(['nothing underneath · Claude gets the drawing and where it is'])

  await box.getByRole('textbox', { name: 'Comment' }).fill('Add a NEW stamp here')
  await box.getByRole('button', { name: 'Send' }).click()
  await expect.poll(async () => (await sentTurns()).length).toBe(1)
  const drawing = (await sentTurns())[0]?.annotations[0] as DrawAnnotation
  expect(drawing).toMatchObject({ kind: 'draw', comment: 'Add a NEW stamp here', targets: [] })
  expect(drawing.boundingBox.width).toBeGreaterThan(50)
  expect(drawing.screenshot).toMatch(/^data:image\/png;base64,/)
})
