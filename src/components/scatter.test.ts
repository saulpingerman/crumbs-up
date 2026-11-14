import { describe, expect, it } from 'vitest'
import { scatter } from './scatter'

describe('scatter', () => {
  it('lays out the same crumbs every time', () => {
    const options = { seed: 4, reach: [40, 90] as [number, number] }
    expect(scatter(8, options)).toEqual(scatter(8, options))
    expect(scatter(8, { ...options, seed: 5 })).not.toEqual(scatter(8, options))
  })

  it('throws them no further than asked', () => {
    for (const crumb of scatter(40, { reach: [40, 90] })) {
      const thrown = Math.hypot(crumb.dx, crumb.up)
      expect(thrown).toBeGreaterThanOrEqual(39)
      expect(thrown).toBeLessThanOrEqual(91)
    }
  })

  it('keeps to the fan it was given', () => {
    // Up and to the right only: never left of the middle, never below it.
    for (const crumb of scatter(12, { reach: [40, 90], from: 20, to: 70 })) {
      expect(crumb.dx).toBeGreaterThan(0)
      expect(crumb.up).toBeLessThan(0)
    }
  })
})
