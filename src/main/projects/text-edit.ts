import type { DefaultTreeAdapterTypes } from 'parse5'
import type { TextEdit } from '@shared/document-bridge'
import { sourceElements } from '../turns/locate'

// A text edit the user made by hand in the Document view (double-click in
// Browse): the element's plain text, replaced in the source file where it is
// written. Only an element whose whole content in the file is plain text can
// be edited this way; anything a script made, or text with tags inside, is
// left to the Agent.

const NOT_WRITTEN = 'This text isn’t written in the file as shown, so ask Claude to change it.'

/** Elements whose text isn't shown as written, or is code. */
const NOT_TEXT = new Set(['script', 'style', 'template', 'textarea', 'title', 'noscript', 'pre'])

/** The source with the edit made, or an Error saying why it can't be made by hand. */
export function applyTextEdit(source: string, edit: TextEdit): string {
  const element = sourceElements(source)(edit.selector)
  const location = element?.sourceCodeLocation
  if (!element || !location?.startTag || !location.endTag) throw new Error(NOT_WRITTEN)
  if (NOT_TEXT.has(element.tagName) || !element.childNodes.every((node): node is DefaultTreeAdapterTypes.TextNode => node.nodeName === '#text')) {
    throw new Error('This text has formatting inside it, so ask Claude to change it.')
  }
  const written = element.childNodes.map((node) => (node as DefaultTreeAdapterTypes.TextNode).value).join('')
  // A script may have written the text on the page, or the file changed since it was shown.
  if (squash(written) !== squash(edit.before)) throw new Error(NOT_WRITTEN)

  const start = location.startTag.endOffset
  const end = location.endTag.startOffset
  const inner = source.slice(start, end)
  // The whitespace around the text in the file (indentation, line breaks) stays as it was.
  const lead = /^\s*/.exec(inner)?.[0] ?? ''
  const trail = /\s*$/.exec(inner)?.[0] ?? ''
  return source.slice(0, start) + lead + escapeText(edit.after.trim()) + trail + source.slice(end)
}

const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll(' ', '&nbsp;')
}
