import { describe, expect, it } from 'vitest'
import { CODE_LIFETIME_MS, parsePending } from './pending-code'

const now = 1_800_000_000_000
const saved = (over: object = {}) =>
  JSON.stringify({ email: 'ana@example.com', purpose: 'signup', at: now - 60_000, ...over })

describe('a code that is still waiting to be entered', () => {
  it('is remembered with what it is for', () => {
    expect(parsePending(saved(), now)).toEqual({ email: 'ana@example.com', purpose: 'signup' })
    expect(parsePending(saved({ purpose: 'recovery' }), now)?.purpose).toBe('recovery')
  })

  it('is forgotten once the code would no longer work', () => {
    expect(parsePending(saved({ at: now - CODE_LIFETIME_MS - 1 }), now)).toBeNull()
    expect(parsePending(saved({ at: now - CODE_LIFETIME_MS + 1_000 }), now)).not.toBeNull()
  })

  it('ignores anything it did not write itself', () => {
    expect(parsePending(null, now)).toBeNull()
    expect(parsePending('not json', now)).toBeNull()
    expect(parsePending(saved({ purpose: 'invite' }), now)).toBeNull()
    expect(parsePending(saved({ email: '' }), now)).toBeNull()
    expect(parsePending(saved({ at: 'yesterday' }), now)).toBeNull()
    // A clock that has since been set back shouldn't keep it alive for ever.
    expect(parsePending(saved({ at: now + 5_000 }), now)).toBeNull()
  })
})
