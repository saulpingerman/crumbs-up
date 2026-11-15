import { describe, expect, it } from 'vitest'
import { errorDetail } from './error-detail'

describe('the detail line under an error', () => {
  it('names the kind of error and what it said, and where it happened', () => {
    expect(errorDetail(new TypeError('x is undefined'), 'starting')).toBe(
      'starting · TypeError: x is undefined',
    )
    expect(errorDetail(new Error('Download failed (404)'))).toBe('Download failed (404)')
  })

  it('copes with things that are not errors, and with silence', () => {
    expect(errorDetail('out of memory')).toBe('out of memory')
    expect(errorDetail(new Error(''), 'downloading')).toBe('downloading · no message')
  })

  it('stays short enough for a phone screen', () => {
    expect(errorDetail(new Error('x'.repeat(500))).length).toBeLessThanOrEqual(160)
  })
})
