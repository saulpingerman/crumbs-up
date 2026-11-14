import { useSyncExternalStore } from 'react'

export type Provider = 'apple' | 'google'

/**
 * Listed in the order they are offered. Apple asks that its button be at
 * least as prominent as any other sign-in option, so it goes first.
 */
const KNOWN: Provider[] = ['apple', 'google']

const CACHE_KEY = 'crumbs-up:sign-in-providers'

function remembered(): Provider[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]')
    return Array.isArray(saved) ? KNOWN.filter((name) => saved.includes(name)) : []
  } catch {
    return []
  }
}

let providers: Provider[] = remembered()
const listeners = new Set<() => void>()

/**
 * Ask the project which sign-in providers are switched on, so that turning
 * Google or Apple on (or off) in the Supabase dashboard is all it takes — no
 * new build of the app. The answer is remembered for the next visit, so the
 * buttons are there at once and when offline.
 */
export async function refreshProviders(url: string, key: string): Promise<void> {
  let enabled: Provider[]
  try {
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
    if (!response.ok) return
    const settings = (await response.json()) as { external?: Record<string, unknown> }
    enabled = KNOWN.filter((name) => settings.external?.[name] === true)
  } catch {
    // Offline, or the server is having a moment: keep what we knew.
    return
  }
  if (enabled.join() === providers.join()) return
  providers = enabled
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(enabled))
  } catch {
    // Storage is full or blocked; the list still holds for this visit.
  }
  listeners.forEach((listener) => listener())
}

/** The sign-in buttons to offer besides email. */
export function useProviders(): Provider[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => providers,
    () => providers,
  )
}
