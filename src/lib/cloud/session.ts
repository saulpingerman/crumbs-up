import { useSyncExternalStore } from 'react'
import { cloudConfigured, getClient, returnUrl, type Provider } from './client'

export type Session =
  /** This copy of the app has no accounts. */
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; userId: string; email: string }

let session: Session = cloudConfigured ? { status: 'loading' } : { status: 'off' }
/** Set after following a "reset password" email: the next step is choosing a new one. */
let recovering = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** For code outside React that needs to react to signing in and out. */
export const subscribeToSession = subscribe

function set(next: Session) {
  const same =
    session.status === next.status &&
    (next.status !== 'signed-in' ||
      (session.status === 'signed-in' && session.userId === next.userId))
  session = next
  if (!same) emit()
}

export interface LinkEvents {
  /** Arrived from an emailed link or a sign-in provider, and it worked. */
  onLinkSignIn?: () => void
  /** Arrived from an emailed link that has expired or was already used. */
  onLinkFailed?: () => void
}

type Client = Awaited<ReturnType<typeof getClient>>

/**
 * An emailed link or a sign-in provider sends people back with the outcome
 * in the URL fragment: either a fresh session or the reason there isn't one.
 * Take it out of the address bar straight away — replacing the history entry,
 * so Back can't bring the tokens into view again — and sign in with it.
 */
async function adoptLink(client: Client): Promise<'none' | 'signed-in' | 'failed'> {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const url = new URL(window.location.href)
  const failed =
    fragment.has('error_description') ||
    fragment.has('error_code') ||
    url.searchParams.has('error_description') ||
    url.searchParams.has('error_code')
  const accessToken = fragment.get('access_token')
  const refreshToken = fragment.get('refresh_token')
  if (!failed && !(accessToken && refreshToken)) return 'none'

  for (const name of ['error', 'error_code', 'error_description']) url.searchParams.delete(name)
  url.hash = ''
  window.history.replaceState(window.history.state, '', url)
  if (failed || !accessToken || !refreshToken) return 'failed'

  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  if (error) return 'failed'
  if (fragment.get('type') === 'recovery') {
    recovering = true
    emit()
  }
  return 'signed-in'
}

let started = false

/** Find out who (if anyone) is signed in, and keep watching. Call once at start-up. */
export function startSession(events: LinkEvents = {}): void {
  if (!cloudConfigured || started) return
  started = true
  void getClient()
    .then(async (client) => {
      // Before listening for changes, so arriving by link counts as how the
      // visit began rather than as a sign-in that happened during it.
      const arrival = await adoptLink(client)
      client.auth.onAuthStateChange((_event, current) => {
        set(
          current?.user
            ? { status: 'signed-in', userId: current.user.id, email: current.user.email ?? '' }
            : { status: 'signed-out' },
        )
      })
      const { data } = await client.auth.getSession()
      set(
        data.session?.user
          ? {
              status: 'signed-in',
              userId: data.session.user.id,
              email: data.session.user.email ?? '',
            }
          : { status: 'signed-out' },
      )
      if (arrival === 'failed') events.onLinkFailed?.()
      else if (arrival === 'signed-in' && data.session) events.onLinkSignIn?.()
    })
    .catch((error: unknown) => {
      console.warn('Could not start accounts', error)
      set({ status: 'signed-out' })
    })
}

export function getSession(): Session {
  return session
}

export function useSession(): Session {
  return useSyncExternalStore(
    subscribe,
    () => session,
    () => session,
  )
}

export function useRecovering(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => recovering,
    () => false,
  )
}

/** Why a sign-in attempt didn't work, in words a person can act on. */
function explain(message: string): string {
  if (/invalid login credentials/i.test(message))
    return 'That email and password don’t match an account.'
  if (/email not confirmed/i.test(message))
    return 'Confirm your email first — check your inbox for the link.'
  if (/already registered|already been registered/i.test(message))
    return 'There’s already an account with that email. Sign in instead.'
  if (/password should be at least|weak password/i.test(message))
    return 'Choose a longer password (at least 8 characters).'
  // A project still on Supabase's starter mail service can only write to its
  // owner, and only a couple of times an hour.
  if (/not authorized/i.test(message))
    return 'This app can’t send email to that address yet, so it can’t confirm the account. Its owner needs to connect a mail service first.'
  if (/email rate limit/i.test(message))
    return 'The app has sent all the email it’s allowed to for now. Try again in an hour.'
  if (/rate limit|too many/i.test(message))
    return 'Too many tries just now. Wait a minute and try again.'
  if (/failed to fetch|network/i.test(message))
    return 'Couldn’t reach the server. Check your connection.'
  return message
}

export class AuthError extends Error {}

/** Run an auth call, turning both thrown and returned errors into one readable error. */
async function run<R extends { error: { message: string } | null }>(
  action: (client: Client) => Promise<R>,
): Promise<R> {
  let result: R
  try {
    result = await action(await getClient())
  } catch (error) {
    throw new AuthError(explain(error instanceof Error ? error.message : String(error)))
  }
  if (result.error) throw new AuthError(explain(result.error.message))
  return result
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  await run((client) => client.auth.signInWithPassword({ email, password }))
}

/** @returns `confirm` when the account needs its email confirmed before signing in. */
export async function signUp(email: string, password: string): Promise<'signed-in' | 'confirm'> {
  const { data } = await run((client) =>
    client.auth.signUp({ email, password, options: { emailRedirectTo: returnUrl() } }),
  )
  return data.session ? 'signed-in' : 'confirm'
}

export async function signInWith(provider: Provider): Promise<void> {
  // Leaves the page for the provider; the session is picked up on return.
  await run((client) =>
    client.auth.signInWithOAuth({ provider, options: { redirectTo: returnUrl() } }),
  )
}

export async function sendPasswordReset(email: string): Promise<void> {
  await run((client) => client.auth.resetPasswordForEmail(email, { redirectTo: returnUrl() }))
}

export async function setNewPassword(password: string): Promise<void> {
  await run((client) => client.auth.updateUser({ password }))
  recovering = false
  emit()
}

export async function signOut(): Promise<void> {
  await run((client) => client.auth.signOut())
}
