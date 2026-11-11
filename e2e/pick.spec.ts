import { rm } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { inDocument, launchApp, makeFolder, type LaunchedApp } from './app'

let launched: LaunchedApp | undefined
let folder: string | undefined

test.afterEach(async () => {
  await launched?.close()
  if (folder) await rm(folder, { recursive: true, force: true })
})

/** A page with a link the page's own script counts clicks on. */
const page = `<!doctype html>
<html>
  <body style="margin: 0; padding: 40px; font: 16px sans-serif">
    <main>
      <h1 class="title">Søster</h1>
      <p><a id="link" href="#bakes">Our bakes</a></p>
      <p>Open daily</p>
    </main>
    <script>document.querySelector('#link').addEventListener('click', () => { window.clicks = (window.clicks || 0) + 1 })</script>
  </body>
</html>
`

async function openEditor() {
  folder = await makeFolder({ 'index.html': page })
  const edited = page.replace('<h1 class="title">', '<h1 class="title" style="color: blue">')
  launched = await launchApp({
    pickFolder: folder,
    agent: {
      turns: [
        [
          { type: 'wait', ms: 300 },
          { type: 'tool', tool: 'edit', file: 'index.html', added: 1, removed: 1, content: edited },
          { type: 'text', text: 'Done.' },
        ],
      ],
    },
  })
  const { window } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()
  await window.getByRole('list', { name: 'Documents' }).getByRole('button', { name: /^index\.html/ }).click()
  const frame = window.getByRole('region', { name: 'Document view' })
  await expect(frame).toHaveAttribute('data-ready', 'true')
  const chat = window.getByRole('complementary', { name: 'Chat' })
  return { ...launched, frame, chat, toolbar: window.getByRole('toolbar', { name: 'Mode' }) }
}

/** Where an element of the Document is in the app's window: the middle of its box. */
async function centerOf(selector: string) {
  if (!launched) throw new Error('No app')
  const { app, window } = launched
  const rect = (await inDocument(app, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)) as {
    x: number
    y: number
  }
  const frame = await window.getByRole('region', { name: 'Document view' }).boundingBox()
  return { x: (frame?.x ?? 0) + rect.x, y: (frame?.y ?? 0) + rect.y }
}

async function clickInDocument(selector: string) {
  const { x, y } = await centerOf(selector)
  await launched?.window.mouse.click(x, y)
}

test("Browse lets the page's links work; Pick blocks them and picks instead", async () => {
  const { app, window, toolbar } = await openEditor()
  await expect(toolbar.getByRole('button', { name: 'Browse' })).toHaveAttribute('aria-pressed', 'true')

  await clickInDocument('#link')
  await expect.poll(() => inDocument(app, '[location.hash, window.clicks]')).toEqual(['#bakes', 1])

  await toolbar.getByRole('button', { name: 'Pick' }).click()
  await expect(toolbar.getByRole('button', { name: 'Pick' })).toHaveAttribute('aria-pressed', 'true')
  await inDocument(app, `history.replaceState(null, '', location.pathname)`)
  await clickInDocument('#link')

  await expect(window.getByRole('dialog', { name: 'Annotation 1' })).toBeVisible()
  expect(await inDocument(app, '[location.hash, window.clicks]')).toEqual(['', 1])

  // Esc discards the Annotation, then leaves Pick.
  await window.keyboard.press('Escape')
  await expect(window.getByRole('dialog', { name: 'Annotation 1' })).toBeHidden()
  await window.keyboard.press('Escape')
  await expect(toolbar.getByRole('button', { name: 'Browse' })).toHaveAttribute('aria-pressed', 'true')
})

test('pick an element by click, comment, add, reopen from its chip and send: the Agent gets the Annotation, and it glows after the edit', async () => {
  const { app, window, frame, chat, toolbar, sentTurns } = await openEditor()
  await window.keyboard.press('p')
  await expect(toolbar.getByRole('button', { name: 'Pick' })).toHaveAttribute('aria-pressed', 'true')

  // Hovering highlights the element with its selector.
  const heading = await centerOf('h1')
  await window.mouse.move(heading.x, heading.y)
  await expect(frame.locator('[data-highlight]')).toHaveText('main › h1.title')

  await window.mouse.click(heading.x, heading.y)
  const box = window.getByRole('dialog', { name: 'Annotation 1' })
  await expect(box.getByRole('textbox', { name: 'Comment' })).toBeFocused()
  await window.keyboard.type('Make this blue')
  const chips = chat.getByRole('list', { name: 'Annotations' })
  await expect(chips.getByRole('listitem')).toHaveText([/1\s*main › h1\.title\s*Make this blue/])
  await window.keyboard.press('Meta+Enter')
  await expect(box).toBeHidden()

  // The marker follows its element when the layout moves (the h1's own top margin was about 21px).
  const marker = frame.locator('[data-marker="1"]')
  await expect(marker).toBeVisible()
  const before = (await marker.boundingBox())?.y ?? 0
  await inDocument(app, `document.querySelector('h1').style.marginTop = '150px'`)
  await expect.poll(async () => Math.round(((await marker.boundingBox())?.y ?? 0) - before)).toBeGreaterThanOrEqual(120)

  // A second pick, then its chip's × removes it.
  await clickInDocument('main > p:last-child')
  await window.getByRole('dialog', { name: 'Annotation 2' }).getByRole('button', { name: 'Add' }).click()
  await expect(chips.getByRole('listitem')).toHaveCount(2)
  await chips.getByRole('button', { name: 'Remove Annotation 2' }).click()
  await expect(chips.getByRole('listitem')).toHaveCount(1)
  await expect(frame.locator('[data-marker="2"]')).toHaveCount(0)

  await chat.getByRole('textbox', { name: 'Message' }).fill('Also tidy up')
  await chips.getByRole('button', { name: 'Annotation 1', exact: true }).click()
  await expect(box.getByRole('textbox', { name: 'Comment' })).toHaveValue('Make this blue')
  await box.getByRole('textbox', { name: 'Comment' }).press('Enter')

  const width = await inDocument(app, 'innerWidth')
  await expect.poll(sentTurns).toEqual([
    {
      text: 'Also tidy up',
      annotations: [
        {
          kind: 'pick',
          number: 1,
          comment: 'Make this blue',
          viewportWidth: width,
          selector: 'main > h1.title',
          tag: 'h1',
          // As it was when picked.
          html: '<h1 class="title">Søster</h1>',
          text: 'Søster',
          lines: { start: 5, end: 5 },
        },
      ],
    },
  ])

  // Sent: the marker fades, the chips empty, and the chat keeps the Annotation.
  await expect(marker).toHaveCount(0)
  await expect(chips).toBeHidden()
  await expect(chat.getByRole('listitem', { name: 'Annotation 1' })).toHaveText(/h1\s*main › h1\.title · \d+px\s*Make this blue/)
  await expect(chat.getByText('Also tidy up')).toBeVisible()
  await expect(chat.getByText('Done.')).toBeVisible()

  // The Agent's edit reloads the Document, and the element the Annotation pointed at glows.
  await expect(window.getByText('Reloaded · scroll kept')).toBeVisible()
  await expect(frame.locator('[data-glow]')).toHaveCount(1)
  await expect(frame.locator('[data-glow]')).toHaveCount(0)
})
