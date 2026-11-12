import { describe, expect, it } from 'vitest'
import { fitScale, SCREENS, viewportOf } from '@shared/viewport'

describe('viewportOf', () => {
  it('gives Desktop the width the window leaves it, in whole px', () => {
    expect(viewportOf('desktop', 853.6)).toEqual({ name: 'Desktop', width: 854 })
  })

  it('gives Tablet and Mobile their own widths, even while the frame is still animating towards them', () => {
    expect(viewportOf('tablet', 600)).toEqual({ name: 'Tablet', width: 820 })
    expect(viewportOf('mobile', 600)).toEqual({ name: 'Mobile', width: 390 })
  })
})

describe('Fit', () => {
  it('lays the Document out at a whole screen, whatever the window leaves', () => {
    expect(viewportOf('desktop', 853.6, true)).toEqual({ name: 'Desktop', width: 1440 })
    expect(viewportOf('mobile', 600, true)).toEqual({ name: 'Mobile', width: 390 })
  })

  it('scales the screen to the tighter of the two sides, and never above actual size', () => {
    expect(fitScale(SCREENS.desktop, { width: 720, height: 900 })).toBe(0.5)
    expect(fitScale(SCREENS.desktop, { width: 1440, height: 450 })).toBe(0.5)
    expect(fitScale(SCREENS.mobile, { width: 2000, height: 2000 })).toBe(1)
  })
})
