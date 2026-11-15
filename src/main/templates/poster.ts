import { TEMPLATE_META } from '@shared/templates'

// The Poster Template: one A4 sheet that is the poster itself, edge to edge,
// and the rules the Agent follows on it. Rules only, no house style.

export function posterFile(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="${TEMPLATE_META}" content="poster">
<title>Poster</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; }
  /* The poster is the whole A4 sheet. */
  .poster {
    position: relative;
    box-sizing: border-box;
    width: 210mm;
    height: 297mm;
    overflow: hidden;
    background: #fff;
    print-color-adjust: exact;
  }
</style>
</head>
<body>
<main class="poster"></main>
</body>
</html>
`
}

export const POSTER_RULES: readonly string[] = [
  'The poster is the whole page: the .poster element is exactly one A4 sheet (210mm × 297mm) and everything on the poster goes inside it. Keep its width, height and overflow: hidden as they are, and keep html and body without margins, so it prints as one A4 page.',
  "Design the poster to fill the sheet edge to edge. The .poster's own background is the poster's background, and its content uses the whole sheet. Never put a smaller poster, card or panel in the middle of the sheet with a backdrop, border or drop shadow around it, and don't style html or body as a backdrop: the edge of the sheet is the edge of the poster.",
  'Lay it out for the fixed sheet, not for a screen: sizes in mm, pt or px, nothing responsive, no scrolling, nothing outside the .poster. Everything must fit on the one page.',
  'Keep the @page rule (size: A4; margin: 0): Margen exports the poster to PDF as that one page.',
]

export function posterInstructions(): string {
  return [
    'The Document open in Margen is a Poster: one A4 page, printed and exported to PDF. Follow these rules whenever you change it:',
    ...POSTER_RULES.map((rule) => `- ${rule}`),
  ].join('\n\n')
}
