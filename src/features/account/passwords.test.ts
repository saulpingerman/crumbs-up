import { describe, expect, it } from 'vitest'
import { looksLikeEmail, passwordProblem } from './passwords'

describe('a password typed twice', () => {
  it('passes when it is long enough and both match', () => {
    expect(passwordProblem('long-enough', 'long-enough')).toBeNull()
  })

  it('is turned away when too short, before anything about matching', () => {
    expect(passwordProblem('short', 'short')).toMatch(/at least 8/)
    expect(passwordProblem('short', 'different')).toMatch(/at least 8/)
  })

  it('is turned away when the two differ, even by a space or a capital', () => {
    expect(passwordProblem('long-enough', 'long-enougH')).toMatch(/don’t match/)
    expect(passwordProblem('long-enough', 'long-enough ')).toMatch(/don’t match/)
  })
})

describe('an email address', () => {
  it('needs something either side of the @ and a dot after it', () => {
    expect(looksLikeEmail('ana@example.com')).toBe(true)
    expect(looksLikeEmail('  ana@example.com ')).toBe(true)
    expect(looksLikeEmail('ana@example')).toBe(false)
    expect(looksLikeEmail('ana.example.com')).toBe(false)
    expect(looksLikeEmail('')).toBe(false)
  })
})
