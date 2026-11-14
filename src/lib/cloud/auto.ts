/**
 * Runs the sync engine at the right moments — after signing in, when the
 * app comes back to the foreground or back online, and shortly after any
 * change on this device — and reports how it is going.
 */
import { liveQuery } from 'dexie'
import { useSyncExternalStore } from 'react'
import { db } from '@/lib/db/db'
import { photoFromBytes } from '@/lib/image'
import { getClient } from './client'
import { getSession, startSession, subscribeToSession, type LinkEvents } from './session'
import { DifferentAccountError, sync, type SyncResult } from './sync'

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error' | 'other-account'

export interface SyncStatus {
  phase: SyncPhase
  /** Changes on this device not yet sent. */
  pending: number
  lastSyncedAt: string | null
  error: string | null
}

let status: SyncStatus = { phase: 'idle', pending: 0, lastSyncedAt: null, error: null }
const listeners = new Set<() => void>()

function update(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((listener) => listener())
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => status,
    () => status,
  )
}

let running: Promise<SyncResult | null> | null = null
let again = false

/**
 * Sync now. If one is already under way, another follows straight after,
 * so a change made mid-sync is never left waiting.
 */
export function requestSync(): Promise<SyncResult | null> {
  if (running) {
    again = true
    return running
  }
  running = runOnce().finally(() => {
    running = null
    if (again) {
      again = false
      void requestSync()
    }
  })
  return running
}

async function runOnce(): Promise<SyncResult | null> {
  const session = getSession()
  if (session.status !== 'signed-in') return null
  if (!navigator.onLine) {
    update({ phase: 'offline' })
    return null
  }
  update({ phase: 'syncing', error: null })
  try {
    const { SupabaseRemote } = await import('./remote')
    const remote = new SupabaseRemote(await getClient(), session.userId)
    const result = await sync(db, remote, { describePhoto: photoFromBytes })
    update({ phase: 'idle', lastSyncedAt: new Date().toISOString() })
    return result
  } catch (error) {
    if (error instanceof DifferentAccountError) {
      update({ phase: 'other-account' })
    } else {
      console.warn('Sync failed', error)
      update({
        phase: navigator.onLine ? 'error' : 'offline',
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return null
  }
}

let started = false
let debounce: ReturnType<typeof setTimeout> | undefined

export interface AutoSyncEvents extends LinkEvents {
  /** Someone signed in with the form on this device. */
  onSignedIn?: () => void
}

/** Begin watching for reasons to sync. Call once at start-up; a no-op without accounts. */
export function startAutoSync(events: AutoSyncEvents = {}): void {
  if (started) return
  started = true
  startSession(events)

  void db.meta.get('syncedAt').then((row) => {
    if (row) update({ lastSyncedAt: row.value })
  })

  // Sync when someone signs in (or was already signed in at start-up).
  let previous = getSession().status
  const onSession = () => {
    const current = getSession().status
    if (current === 'signed-in' && previous !== 'signed-in') {
      if (previous === 'signed-out') events.onSignedIn?.()
      void requestSync()
    }
    if (current !== 'signed-in') update({ phase: 'idle', error: null })
    previous = current
  }
  subscribeToSession(onSession)
  onSession()

  // A change on this device: wait a moment for any more, then send.
  liveQuery(() => db.outbox.count()).subscribe({
    next: (pending) => {
      update({ pending })
      if (pending === 0 || getSession().status !== 'signed-in') return
      clearTimeout(debounce)
      debounce = setTimeout(() => void requestSync(), 2500)
    },
    error: () => {},
  })

  window.addEventListener('online', () => void requestSync())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void requestSync()
  })
  // While the app is open, look for changes from other devices now and then.
  setInterval(() => {
    if (document.visibilityState === 'visible') void requestSync()
  }, 3 * 60_000)
}
