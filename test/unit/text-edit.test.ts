import { describe, expect, test } from 'vitest'
import { applyTextEdit } from '../../src/main/projects/text-edit'

const page = `<!doctype html>
<html>
  <body>
    <h1 class="title">
      Søster &amp; Co
    </h1>
    <p>Open <b>daily</b></p>
    <p id="hours">8–16</p>
  </body>
</html>
`

describe('a text edit made by hand', () => {
  test('replaces the plain text where it is written, keeping the whitespace around it and escaping what needs it', () => {
    const out = applyTextEdit(page, { selector: 'body > h1.title', before: 'Søster & Co', after: 'Søster <Bakery>' })
    expect(out).toContain('<h1 class="title">\n      Søster &lt;Bakery&gt;\n    </h1>')
    expect(out.replace('Søster &lt;Bakery&gt;', 'Søster &amp; Co')).toBe(page)
  })

  test('finds the element by id', () => {
    expect(applyTextEdit(page, { selector: 'body > p#hours', before: '8–16', after: '7–15' })).toContain('<p id="hours">7–15</p>')
  })

  test('leaves text with tags inside, text not in the file, and a changed file to the Agent', () => {
    expect(() => applyTextEdit(page, { selector: 'body > p:nth-of-type(1)', before: 'Open daily', after: 'x' })).toThrow(/formatting/)
    expect(() => applyTextEdit(page, { selector: 'body > section', before: 'x', after: 'y' })).toThrow(/isn’t written/)
    expect(() => applyTextEdit(page, { selector: 'body > p#hours', before: '9–17', after: 'y' })).toThrow(/isn’t written/)
  })
})
