import { afterEach, describe, expect, it, vi } from 'vitest'

/** A fresh copy of the settings module, reading from `saved` as if it were what a phone had stored. */
async function settingsFrom(saved?: object) {
  const store = new Map<string, string>()
  if (saved) store.set('crumbs-up:settings', JSON.stringify(saved))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  })
  vi.resetModules()
  return (await import('./settings')).getSettings()
}

afterEach(() => vi.unstubAllGlobals())

describe('the defaults', () => {
  it('start new people with taste and texture counting most', async () => {
    const settings = await settingsFrom()
    expect(settings.weightPreset).toBe('eating')
  })

  it('move settings saved under the old defaults over, once', async () => {
    // Before, every save wrote the whole set, so "equal" and "full" were
    // stored whether or not anyone chose them.
    const moved = await settingsFrom({ weightPreset: 'equal', reviewStyle: 'full', theme: 'dark' })
    expect(moved.weightPreset).toBe('eating')
    expect(moved.theme).toBe('dark')
  })

  it('keep a weighting that was picked on purpose', async () => {
    const kept = await settingsFrom({ weightPreset: 'taste', reviewStyle: 'full' })
    expect(kept.weightPreset).toBe('taste')
  })

  it('leave choices made since the change alone', async () => {
    const chosen = await settingsFrom({ weightPreset: 'equal', reviewStyle: 'full', version: 2 })
    expect(chosen.weightPreset).toBe('equal')
  })
})
