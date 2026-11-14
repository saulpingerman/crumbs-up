import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * Accounts are optional. Without a Supabase project configured the app is
 * exactly the device-only journal it has always been, and none of the
 * account code is even downloaded.
 */
export const cloudConfigured = Boolean(url && key)

export type Provider = 'google' | 'apple'

/** Sign-in buttons to offer besides email, as configured for this deployment. */
export const providers: Provider[] = (import.meta.env.VITE_AUTH_PROVIDERS ?? '')
  .split(',')
  .map((name) => name.trim().toLowerCase())
  .filter((name): name is Provider => name === 'google' || name === 'apple')

let client: Promise<SupabaseClient> | null = null

export function getClient(): Promise<SupabaseClient> {
  if (!url || !key)
    return Promise.reject(new Error('Accounts are not set up for this copy of the app.'))
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url, key, {
      auth: {
        // Emailed links (confirm your address, reset your password) are often
        // opened in a different browser than the one that asked for them —
        // Mail on an iPhone opens Safari, not the installed app. The PKCE
        // flow only works in the browser that started it, so those links
        // would quietly do nothing; the implicit flow works anywhere. The
        // tokens arrive in the URL fragment, which is never sent to a server;
        // `adoptLink` in session.ts reads them and clears the address bar.
        flowType: 'implicit',
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
      },
    }),
  )
  return client
}

/** Where sign-in emails and provider redirects should bring people back to. */
export function returnUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href
}
