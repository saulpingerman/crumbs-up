import { useSyncExternalStore } from 'react'
import { bakeryKey, cookieKey, typeKey, type CommunityCookie } from '@/lib/community'

/**
 * Entries someone has hidden from their own Top rated: a single cookie, a
 * whole bakery, or a whole kind of cookie. Kept on this device; nobody else
 * is affected (the owner removes things for everyone, in the database).
 */
export interface Hidden {
  kind: 'cookie' | 'bakery' | 'type'
  key: string
}

const STORAGE = 'crumbs-up:hidden-top'
const listeners = new Set<() => void>()
let cache: Hidden[] | null = null

export function parseHidden(raw: string | null): Hidden[] {
  try {
    const list: unknown = JSON.parse(raw ?? '[]')
    if (!Array.isArray(list)) return []
    return list.filter(
      (h): h is Hidden =>
        typeof h === 'object' &&
        h !== null &&
        ['cookie', 'bakery', 'type'].includes((h as Hidden).kind) &&
        typeof (h as Hidden).key === 'string',
    )
  } catch {
    return []
  }
}

function read(): Hidden[] {
  if (cache) return cache
  try {
    cache = parseHidden(localStorage.getItem(STORAGE))
  } catch {
    cache = []
  }
  return cache
}

function write(next: Hidden[]) {
  cache = next
  try {
    localStorage.setItem(STORAGE, JSON.stringify(next))
  } catch {
    // Storage switched off: hidden until the page is reloaded.
  }
  listeners.forEach((listener) => listener())
}

export function hide(entry: Hidden): void {
  const now = read()
  if (now.some((h) => h.kind === entry.kind && h.key === entry.key)) return
  write([...now, entry])
}

export function showAll(): void {
  write([])
}

export function useHidden(): Hidden[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    read,
    read,
  )
}

/** The cookies left once everything hidden is taken out. */
export function withoutHidden(cookies: CommunityCookie[], hidden: Hidden[]): CommunityCookie[] {
  if (hidden.length === 0) return cookies
  const keys = {
    cookie: new Set(hidden.filter((h) => h.kind === 'cookie').map((h) => h.key)),
    bakery: new Set(hidden.filter((h) => h.kind === 'bakery').map((h) => h.key)),
    type: new Set(hidden.filter((h) => h.kind === 'type').map((h) => h.key)),
  }
  return cookies.filter(
    (c) =>
      !keys.cookie.has(cookieKey(c)) &&
      !keys.bakery.has(bakeryKey(c)) &&
      !keys.type.has(typeKey(c)),
  )
}
