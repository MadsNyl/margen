import { describe, expect, it } from 'vitest'
import { viewportOf } from '@shared/viewport'

describe('viewportOf', () => {
  it('gives Desktop the width the window leaves it, in whole px', () => {
    expect(viewportOf('desktop', 853.6)).toEqual({ name: 'Desktop', width: 854 })
  })

  it('gives Tablet and Mobile their own widths, even while the frame is still animating towards them', () => {
    expect(viewportOf('tablet', 600)).toEqual({ name: 'Tablet', width: 820 })
    expect(viewportOf('mobile', 600)).toEqual({ name: 'Mobile', width: 390 })
  })
})
