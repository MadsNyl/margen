import { TEMPLATE_META } from '@shared/templates'

// The Slides Template: a deck where each slide fills the whole window, shows
// its number, and is stepped through with the keys; printed (and exported to
// PDF) one slide per page. The deck's script and print rules are in the
// starting file so it works the same opened in a browser. Rules only, no house style.

/** Steps through the slides with the keys; the slide shown is the URL's `#n`, so a reload keeps it. */
const SCRIPT = `(() => {
  const slides = () => [...document.querySelectorAll('.slide')]
  const shown = () => Math.min(Math.max(parseInt(location.hash.slice(1), 10) || 1, 1), Math.max(slides().length, 1))
  const show = () => slides().forEach((slide, i) => slide.classList.toggle('current', i === shown() - 1))
  const go = (n) => {
    history.replaceState(null, '', '#' + Math.min(Math.max(n, 1), Math.max(slides().length, 1)))
    show()
  }
  const NEXT = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']
  const BACK = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']
  addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.target instanceof Element && event.target.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"])')) return
    const back = BACK.includes(event.key) || (event.key === ' ' && event.shiftKey)
    if (back) go(shown() - 1)
    else if (NEXT.includes(event.key)) go(shown() + 1)
    else if (event.key === 'Home') go(1)
    else if (event.key === 'End') go(slides().length)
    else return
    event.preventDefault()
  })
  addEventListener('hashchange', show)
  show()
})()`

export function slidesFile(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="${TEMPLATE_META}" content="slides">
<title>Slides</title>
<style>
  @page { size: 13.333in 7.5in; margin: 0; }
  html, body { margin: 0; height: 100%; }
  body { overflow: hidden; }
  /* Every slide fills the whole window; only the current one shows. */
  .deck { position: relative; width: 100vw; height: 100vh; counter-reset: slide; }
  .slide {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    overflow: hidden;
    background: #fff;
    counter-increment: slide;
    print-color-adjust: exact;
  }
  @media screen { .slide:not(.current) { visibility: hidden; } }
  /* The slide number, on every slide. */
  .slide::after {
    content: counter(slide);
    position: absolute;
    right: 3vw;
    bottom: 3vh;
    font: 500 2vmin/1 system-ui, sans-serif;
    color: #888;
  }
  /* Printed, every slide is a page of its own. */
  @media print {
    body { overflow: visible; }
    .deck { height: auto; }
    .slide { position: relative; width: 100vw; height: 100vh; break-after: page; }
  }
</style>
</head>
<body>
<main class="deck">
  <section class="slide current"></section>
</main>
<script>
${SCRIPT}
</script>
</body>
</html>
`
}

export const SLIDES_RULES: readonly string[] = [
  'Every slide is a <section class="slide"> directly inside the <main class="deck">, in the order they are shown. Add, remove and reorder slides as sections; there is nothing else to update.',
  "Each slide fills the whole window, edge to edge: it is the slide, with its own background. Never put a smaller slide or card in the middle of the window with a backdrop, border or drop shadow around it. Size type, spacing and images relative to the window (vw, vh, vmin, or percentages), so a slide looks the same in any window and on a PDF page; never fixed px for the layout. Nothing scrolls: everything on a slide fits on it.",
  'Keep the deck\'s CSS rules as they are: the absolutely placed .slide, the screen-only `.slide:not(.current) { visibility: hidden }`, and the @page and @media print rules, which print every slide as a page of its own. Hide and show slides only through the .current class; don\'t use display: none on a slide, and don\'t set visibility on anything inside one.',
  'Every slide shows its number, from the `.slide::after` CSS counter. Restyle it to suit the deck (font, colour, corner) but keep it on every slide and keep it a counter, so the numbers stay right as slides move. Don\'t write slide numbers by hand.',
  'Keep the deck\'s <script> as it is: the arrow keys, Space, Enter, Page Up/Down, Home and End step through the slides, and the URL\'s #n is the slide shown. Don\'t add Previous/Next buttons, dots, progress bars or other navigation controls, and no click to advance.',
  'Margen exports the deck to PDF, one slide per page (16:9, 13.33 × 7.5 in).',
]

export function slidesInstructions(): string {
  return [
    'The Document open in Margen is Slides: a deck where each slide fills the whole window, stepped through with the keys and exported to PDF one slide per page. Follow these rules whenever you change it:',
    ...SLIDES_RULES.map((rule) => `- ${rule}`),
  ].join('\n\n')
}
