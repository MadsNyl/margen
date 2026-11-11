import { rm } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { inDocument, launchApp, makeFolder, type LaunchedApp } from './app'

let launched: LaunchedApp | undefined
let folder: string | undefined

test.afterEach(async () => {
  await launched?.close()
  if (folder) await rm(folder, { recursive: true, force: true })
})

/**
 * Every visible element has an id, so the highlight's label is just `tag#id`.
 * A hidden block and a script are not on the page; the last section is far down.
 */
const page = `<!doctype html>
<html>
  <body style="margin: 0; padding: 40px; font: 16px sans-serif">
    <header id="top"><h1 id="title">Søster</h1><nav id="nav"><a id="bakes" href="#bakes">Bakes</a> <a id="visit" href="#visit">Visit</a></nav></header>
    <main id="main">
      <p id="intro">Open daily</p>
      <div id="gone" style="display: none"><span id="ghost">Not on the page</span></div>
      <section id="hours" style="margin-top: 2000px"><h2 id="when">Hours</h2><p id="times">8–16</p></section>
    </main>
    <script>window.loaded = true</script>
  </body>
</html>
`

const WALK = ['header#top', 'h1#title', 'nav#nav', 'a#bakes', 'a#visit', 'main#main', 'p#intro', 'section#hours', 'h2#when', 'p#times']

async function openInPick() {
  folder = await makeFolder({ 'index.html': page })
  launched = await launchApp({ pickFolder: folder, agent: { turns: [] } })
  const { app, window } = launched
  await window.getByRole('button', { name: /Open a folder/ }).click()
  await window.getByRole('list', { name: 'Documents' }).getByRole('button', { name: /^index\.html/ }).click()
  const frame = window.getByRole('region', { name: 'Document view' })
  await expect(frame).toHaveAttribute('data-ready', 'true')
  const toolbar = window.getByRole('toolbar', { name: 'Mode' })
  await window.keyboard.press('p')
  await expect(toolbar.getByRole('button', { name: 'Pick' })).toHaveAttribute('aria-pressed', 'true')
  // The new Mode reaches the page a moment after the toolbar shows it: wait for its plain cursor.
  await expect.poll(() => inDocument(app, `getComputedStyle(document.querySelector('#bakes')).cursor`)).toBe('default')
  const highlight = frame.locator('[data-highlight]')
  const guide = window.getByRole('note', { name: 'Keys' })
  return { app, window, frame, highlight, guide, chat: window.getByRole('complementary', { name: 'Chat' }) }
}

test('holding → walks every visible element from top to bottom, scrolling each into view, with the key guide showing', async () => {
  const { app, window, highlight, guide } = await openInPick()
  await expect(guide).toBeHidden()

  for (const label of WALK) {
    await window.keyboard.press('ArrowRight')
    await expect(highlight).toHaveText(label)
    await expect(highlight.locator('..')).toHaveAttribute('data-kbd', 'true')
  }
  await expect(guide).toBeVisible()
  await expect(guide).toContainText('parent')

  // The page scrolled to keep the far-down section in view.
  expect(await inDocument(app, 'scrollY')).toBeGreaterThan(1000)
  const box = (await inDocument(app, `(() => { const r = document.querySelector('#times').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: innerHeight } })()`)) as {
    top: number
    bottom: number
    height: number
  }
  expect(box.top).toBeGreaterThanOrEqual(0)
  expect(box.bottom).toBeLessThanOrEqual(box.height)

  // At the end it stays; ← walks back.
  await window.keyboard.press('ArrowRight')
  await expect(highlight).toHaveText('p#times')
  await window.keyboard.press('ArrowLeft')
  await expect(highlight).toHaveText('h2#when')
})

test('↑ goes to the parent, ↓ to the first child, and ↵ picks the highlighted element', async () => {
  const { window, highlight, guide } = await openInPick()
  const steps: [string, string][] = [
    ['ArrowRight', 'header#top'],
    ['ArrowDown', 'h1#title'],
    ['ArrowRight', 'nav#nav'],
    ['ArrowDown', 'a#bakes'],
    ['ArrowUp', 'nav#nav'],
    ['ArrowUp', 'header#top'],
    ['ArrowUp', 'body'],
    ['ArrowDown', 'header#top'],
    ['ArrowDown', 'h1#title'],
  ]
  for (const [key, label] of steps) {
    await window.keyboard.press(key)
    await expect(highlight).toHaveText(label)
  }
  await expect(guide).toBeVisible()

  await window.keyboard.press('Enter')
  const box = window.getByRole('dialog', { name: 'Annotation 1' })
  await expect(box).toBeVisible()
  await expect(box.getByText('h1#title')).toBeVisible()
  await expect(box.getByRole('textbox', { name: 'Comment' })).toBeFocused()
})

test('the arrow keys leave the highlight alone while typing in the comment box or the Composer', async () => {
  const { window, highlight, chat } = await openInPick()
  await window.keyboard.press('ArrowRight')
  await window.keyboard.press('ArrowDown')
  await expect(highlight).toHaveText('h1#title')
  await window.keyboard.press('Enter')

  const comment = window.getByRole('dialog', { name: 'Annotation 1' }).getByRole('textbox', { name: 'Comment' })
  await expect(comment).toBeFocused()
  await window.keyboard.type('Bigger')
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft']) await window.keyboard.press(key)
  await expect(highlight).toHaveText('h1#title')
  await window.keyboard.type('!')
  await expect(comment).toHaveValue('Bigge!r')
  await window.keyboard.press('Meta+Enter')

  const message = chat.getByRole('textbox', { name: 'Message' })
  await message.click()
  await window.keyboard.type('Hello')
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft']) await window.keyboard.press(key)
  await expect(highlight).toHaveText('h1#title')
  await expect(window.getByRole('dialog', { name: 'Annotation 2' })).toHaveCount(0)
})
