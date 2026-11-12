import { describe, expect, it } from 'vitest'
import { narrationSchedule, parseNarration, voiceMarker, withVoiceMarker } from '@shared/narration'

const page = (block: string) => `<!doctype html><html><head><title>v</title></head><body><main class="stage"></main>${block}</body></html>`

describe('parseNarration', () => {
  it('reads the lines of the narration block: start time and text, in order', () => {
    const html = page(`<script type="application/json" id="narration">
[
  { "start": 0.5, "text": "The first line." },
  { "start": 4.2, "text": "The next one." }
]
</script>`)
    expect(parseNarration(html)).toEqual({
      lines: [
        { start: 0.5, text: 'The first line.' },
        { start: 4.2, text: 'The next one.' },
      ],
    })
  })

  it('is no lines and no problem when there is no narration block', () => {
    expect(parseNarration(page(''))).toEqual({ lines: [] })
    expect(parseNarration(page('<script type="application/json" id="data">[{"start":1,"text":"x"}]</script>'))).toEqual({ lines: [] })
  })

  it('finds the block whatever its attribute order and quotes', () => {
    const html = page(`<script id='narration' type='application/json'>[{"start":1,"text":"Hi."}]</script>`)
    expect(parseNarration(html).lines).toEqual([{ start: 1, text: 'Hi.' }])
  })

  it('reports bad JSON instead of failing', () => {
    const result = parseNarration(page('<script type="application/json" id="narration">[{ "start": 1, "text": "Hi." },]</script>'))
    expect(result.lines).toEqual([])
    expect(result.problem).toMatch(/isn’t valid JSON/)
  })

  it('keeps the good lines and reports the ones it skips', () => {
    const html = page(`<script type="application/json" id="narration">[
      { "start": 1, "text": "Fine." },
      { "start": "2", "text": "Start is a string." },
      { "start": 3 },
      { "start": -1, "text": "Before the start." },
      { "start": 5, "text": "   " },
      { "start": 6, "text": "Also fine." }
    ]</script>`)
    const result = parseNarration(html)
    expect(result.lines).toEqual([
      { start: 1, text: 'Fine.' },
      { start: 6, text: 'Also fine.' },
    ])
    expect(result.problem).toBe('Narration lines 2, 3, 4 and 5 need a "start" in seconds (0 or more) and a "text"; they were skipped.')
  })

  it('reports a block that is not a list', () => {
    const result = parseNarration(page('<script type="application/json" id="narration">{"start": 1, "text": "Hi."}</script>'))
    expect(result).toEqual({ lines: [], problem: 'The narration block must be a list of lines.' })
  })

  it('orders the lines by start time', () => {
    const html = page('<script type="application/json" id="narration">[{"start":4,"text":"B"},{"start":1,"text":"A"}]</script>')
    expect(parseNarration(html).lines.map((line) => line.text)).toEqual(['A', 'B'])
  })
})

const head = (meta: string) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="margen-template" content="animation-video">\n${meta}<title>v</title>\n</head>\n<body></body>\n</html>\n`

describe('voiceMarker', () => {
  it('reads the Voice id from <meta name="margen-voice">', () => {
    expect(voiceMarker(head('<meta name="margen-voice" content="kokoro/af_heart">\n'))).toBe('kokoro/af_heart')
    expect(voiceMarker(head(`<meta content='piper/no_NO-talesyntese-medium' name='margen-voice'>\n`))).toBe('piper/no_NO-talesyntese-medium')
  })

  it('is undefined without one, or with an empty one', () => {
    expect(voiceMarker(head(''))).toBeUndefined()
    expect(voiceMarker(head('<meta name="margen-voice" content=" ">\n'))).toBeUndefined()
  })
})

describe('withVoiceMarker', () => {
  it('adds the marker after the Template marker', () => {
    expect(withVoiceMarker(head(''), 'kokoro/af_heart')).toBe(head('<meta name="margen-voice" content="kokoro/af_heart">\n'))
  })

  it('replaces the Voice already there, and leaves the rest of the file as it was', () => {
    const before = head('<meta  content="kokoro/af_heart" name="margen-voice" >\n')
    expect(withVoiceMarker(before, 'piper/en_GB-alba-medium')).toBe(head('<meta name="margen-voice" content="piper/en_GB-alba-medium">\n'))
  })

  it('removes the marker (and its line) for no Voice', () => {
    expect(withVoiceMarker(head('<meta name="margen-voice" content="kokoro/af_heart">\n'), null)).toBe(head(''))
    expect(withVoiceMarker(head(''), null)).toBe(head(''))
  })

  it('goes into <head> when there is no Template marker', () => {
    expect(withVoiceMarker('<html><head><title>v</title></head></html>', 'kokoro/af_heart')).toBe(
      '<html><head>\n<meta name="margen-voice" content="kokoro/af_heart"><title>v</title></head></html>',
    )
  })
})

describe('narrationSchedule', () => {
  const lines = [
    { start: 0.5, duration: 2 },
    { start: 4, duration: 1.5 },
    { start: 8, duration: 3 },
  ]

  it('from the start, plays every line after its start', () => {
    expect(narrationSchedule(lines, 0)).toEqual([
      { index: 0, delay: 0.5, offset: 0 },
      { index: 1, delay: 4, offset: 0 },
      { index: 2, delay: 8, offset: 0 },
    ])
  })

  it('from partway through a line, plays the rest of it at once and skips the lines already over', () => {
    expect(narrationSchedule(lines, 4.5)).toEqual([
      { index: 1, delay: 0, offset: 0.5 },
      { index: 2, delay: 3.5, offset: 0 },
    ])
  })

  it('from between lines or after the last one, waits for the next or plays nothing', () => {
    expect(narrationSchedule(lines, 6)).toEqual([{ index: 2, delay: 2, offset: 0 }])
    expect(narrationSchedule(lines, 11)).toEqual([])
    expect(narrationSchedule(lines, 12)).toEqual([])
  })

  it('leaves out lines without audio yet', () => {
    const [first, , last] = lines
    expect(narrationSchedule([first, undefined, last], 0).map((entry) => entry.index)).toEqual([0, 2])
  })
})
