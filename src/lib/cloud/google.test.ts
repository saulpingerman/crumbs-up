import { describe, expect, it } from 'vitest'
import { makeNonce, sha256Hex } from './google'

describe('the one-time value behind a Google sign-in', () => {
  it('hashes the way the account service will', async () => {
    // The standard test vector for SHA-256.
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('gives Google the hash of what the account service is given', async () => {
    const { raw, hashed } = await makeNonce()
    expect(hashed).toBe(await sha256Hex(raw))
    expect(hashed).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is different every time', async () => {
    const [a, b] = await Promise.all([makeNonce(), makeNonce()])
    expect(a.raw).not.toBe(b.raw)
    expect(a.hashed).not.toBe(b.hashed)
  })
})
