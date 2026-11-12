// Reading and setting Margen's markers in a Document's HTML: `<meta name="…" content="…">`
// tags (ADR 0004), found by scanning the text, so the rest of the file stays as it was.

/** An attribute's value in one start tag (`<meta name="…">`), with either kind of quote or none. */
export function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined
}

/** The `<meta name="…">` tags named `name` in `html`, with where each starts. */
function metaTags(html: string, name: string): RegExpExecArray[] {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].filter(([tag]) => attribute(tag, 'name')?.toLowerCase() === name)
}

/** The `content` of the first `<meta name="…">` named `name` that has one, trimmed. */
export function metaContent(html: string, name: string): string | undefined {
  for (const [tag] of metaTags(html, name)) {
    const content = attribute(tag, 'content')?.trim()
    if (content) return content
  }
  return undefined
}

/**
 * `html` with its `<meta name="…">` named `name` set to `content` (which must need no escaping), or removed for `null`.
 * A new tag goes on the line after the one named `after`, else at the top of `<head>`; nothing else changes.
 */
export function withMeta(html: string, name: string, content: string | null, after?: string): string {
  const tag = content === null ? '' : `<meta name="${name}" content="${content}">`
  const [existing] = metaTags(html, name)
  if (existing) {
    const at = existing.index
    if (tag) return html.slice(0, at) + tag + html.slice(at + existing[0].length)
    // With the line break and indent in front of it, so its line goes too.
    const before = /\r?\n[ \t]*$/.exec(html.slice(0, at))
    return html.slice(0, before ? before.index : at) + html.slice(at + existing[0].length)
  }
  if (!tag) return html
  const [neighbour] = after ? metaTags(html, after) : []
  const anchor = neighbour ?? /<head\b[^>]*>/i.exec(html)
  if (!anchor) return `${tag}\n${html}`
  const end = anchor.index + anchor[0].length
  return `${html.slice(0, end)}\n${tag}${html.slice(end)}`
}
