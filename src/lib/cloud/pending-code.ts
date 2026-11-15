import type { CodePurpose } from './session'

/**
 * Someone who has asked for a code leaves the app to read their email. On a
 * phone the page is often thrown away while they are gone, so where they
 * were — which address, and what the code is for — is kept here, not in the
 * form. Nothing secret: the code itself is never stored.
 */
export interface PendingCode {
  email: string
  purpose: CodePurpose
}

const KEY = 'crumbs-up:pending-code'
/** Codes stop working after an hour; so does the reminder to enter one. */
export const CODE_LIFETIME_MS = 60 * 60 * 1000

export function parsePending(raw: string | null, now: number): PendingCode | null {
  if (!raw) return null
  try {
    const saved = JSON.parse(raw) as Partial<PendingCode> & { at?: unknown }
    if (typeof saved.email !== 'string' || !saved.email) return null
    if (saved.purpose !== 'signup' && saved.purpose !== 'recovery') return null
    if (typeof saved.at !== 'number' || now - saved.at > CODE_LIFETIME_MS || saved.at > now)
      return null
    return { email: saved.email, purpose: saved.purpose }
  } catch {
    return null
  }
}

export function readPending(): PendingCode | null {
  try {
    return parsePending(localStorage.getItem(KEY), Date.now())
  } catch {
    return null
  }
}

export function rememberPending(pending: PendingCode | null): void {
  try {
    if (pending) localStorage.setItem(KEY, JSON.stringify({ ...pending, at: Date.now() }))
    else localStorage.removeItem(KEY)
  } catch {
    // Private browsing with storage switched off: the form still works, it
    // just won't remember across a reload.
  }
}
