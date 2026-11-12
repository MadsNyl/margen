import { describe, expect, it } from 'vitest'
import { mixNarration } from '../../src/main/narration/mix'
import { decodeWav, encodeWav } from '../../src/main/voices/wav'

const RATE = 1000
const tone = (seconds: number, value: number) => encodeWav(new Float32Array(Math.round(seconds * RATE)).fill(value), RATE)
/** The 16-bit value a sample in [-1, 1] is written as, read back. */
const pcm = (value: number) => Math.round(value * 0x7fff) / 0x7fff

describe('mixNarration', () => {
  it('puts each line at its start, with silence before and between, ending with the last line', () => {
    const { samples, sampleRate } = decodeWav(
      mixNarration([
        { start: 0.5, wav: tone(0.25, 0.5) },
        { start: 1.5, wav: tone(0.5, -0.25) },
      ]),
    )
    expect(sampleRate).toBe(RATE)
    expect(samples.length).toBe(2000)
    expect(samples[499]).toBe(0)
    expect(samples[500]).toBeCloseTo(pcm(0.5), 4)
    expect(samples[749]).toBeCloseTo(pcm(0.5), 4)
    expect(samples[750]).toBe(0)
    expect(samples[1499]).toBe(0)
    expect(samples[1500]).toBeCloseTo(pcm(-0.25), 4)
    expect(samples[1999]).toBeCloseTo(pcm(-0.25), 4)
  })

  it('adds up lines that overlap, kept within full scale', () => {
    const { samples } = decodeWav(
      mixNarration([
        { start: 0, wav: tone(1, 0.75) },
        { start: 0.5, wav: tone(1, 0.75) },
      ]),
    )
    expect(samples.length).toBe(1500)
    expect(samples[250]).toBeCloseTo(pcm(0.75), 4)
    expect(samples[750]).toBe(1)
    expect(samples[1250]).toBeCloseTo(pcm(0.75), 4)
  })

  it('is a silent WAV with no lines', () => {
    expect(decodeWav(mixNarration([])).samples.length).toBe(0)
  })

  it('refuses lines spoken at different rates', () => {
    expect(() => mixNarration([{ start: 0, wav: tone(0.1, 0.1) }, { start: 1, wav: encodeWav(new Float32Array(10), 2000) }])).toThrow(/rate/)
  })
})
