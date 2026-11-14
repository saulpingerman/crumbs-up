import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Load the module fresh, as a new visit to the app would. */
async function visit() {
  vi.resetModules()
  return import('./providers')
}

function serverSays(external: Record<string, boolean>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ external }), { status: 200 })),
  )
}

describe('sign-in providers', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    })
    vi.doMock('react', () => ({
      useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('react')
  })

  it('offers what the project has switched on, Apple first', async () => {
    const providers = await visit()
    expect(providers.useProviders()).toEqual([])

    serverSays({ google: true, apple: true, github: true, email: true })
    await providers.refreshProviders('https://example.supabase.co', 'key')
    expect(providers.useProviders()).toEqual(['apple', 'google'])
    expect(fetch).toHaveBeenCalledWith('https://example.supabase.co/auth/v1/settings', {
      headers: { apikey: 'key' },
    })
  })

  it('remembers the answer for the next visit, and keeps it when the server cannot be reached', async () => {
    let providers = await visit()
    serverSays({ google: true, apple: false })
    await providers.refreshProviders('https://example.supabase.co', 'key')

    providers = await visit()
    expect(providers.useProviders()).toEqual(['google'])

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await providers.refreshProviders('https://example.supabase.co', 'key')
    expect(providers.useProviders()).toEqual(['google'])
  })

  it('stops offering a provider that has been switched off', async () => {
    let providers = await visit()
    serverSays({ google: true })
    await providers.refreshProviders('https://example.supabase.co', 'key')

    serverSays({ google: false })
    await providers.refreshProviders('https://example.supabase.co', 'key')
    expect(providers.useProviders()).toEqual([])
    providers = await visit()
    expect(providers.useProviders()).toEqual([])
  })
})
