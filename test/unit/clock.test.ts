import { describe, expect, it } from 'vitest'
import { formatTime, videoLength } from '@shared/clock'

describe('formatTime', () => {
  it('shows minutes, seconds and tenths', () => {
    expect(formatTime(12.4)).toBe('0:12.4')
    expect(formatTime(0)).toBe('0:00.0')
    expect(formatTime(75.25)).toBe('1:15.3')
    expect(formatTime(600)).toBe('10:00.0')
  })

  it('carries a tenth that rounds up into the next second and minute', () => {
    expect(formatTime(59.96)).toBe('1:00.0')
    expect(formatTime(9.99)).toBe('0:10.0')
  })
})

describe('videoLength', () => {
  it('is when the last animation ends, in seconds', () => {
    expect(videoLength([5000, 12_400, 800])).toBe(12.4)
  })

  it('leaves out animations that never end, and is 0 with nothing that does', () => {
    expect(videoLength([3000, Infinity])).toBe(3)
    expect(videoLength([])).toBe(0)
    expect(videoLength([Infinity])).toBe(0)
  })
})
