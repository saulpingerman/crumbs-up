/**
 * Google's own sign-in box ("Sign in with Google"), as opposed to being sent
 * away to Google and back through the account service.
 *
 * It matters for one visible reason. The round trip goes through the account
 * service's address, so Google's screen says "continue to
 * <project>.supabase.co". The box is opened by this site, so it says
 * "crumbs-up.com". It ends the same way: Google vouches for who the person
 * is with a signed token, and the account service checks it.
 */

/** The OAuth client the Google sign-in is registered under. Public, like any client id. */
export const GOOGLE_CLIENT_ID: string =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''

const SCRIPT = 'https://accounts.google.com/gsi/client'
const LOAD_TIMEOUT_MS = 8000

/** What Google hands back once someone has picked their account. */
export interface GoogleCredential {
  /** A token signed by Google saying who they are. */
  credential: string
}

/** The few corners of Google's library this app uses. */
export interface GoogleIdentity {
  initialize(options: {
    client_id: string
    callback: (response: GoogleCredential) => void
    nonce?: string
    ux_mode?: 'popup'
    auto_select?: boolean
    itp_support?: boolean
  }): void
  renderButton(
    parent: HTMLElement,
    options: {
      type: 'standard'
      theme: 'outline' | 'filled_black'
      size: 'large'
      shape: 'pill'
      text: 'continue_with'
      logo_alignment: 'center'
      width: number
    },
  ): void
  cancel(): void
}

type WithGoogle = Window & { google?: { accounts?: { id?: GoogleIdentity } } }

/**
 * Whether to offer Google's box here. An app opened from a phone's home
 * screen can't always hear back from the window the box opens in, so there
 * the round trip is the dependable choice.
 */
export function googleBoxAvailable(): boolean {
  if (!GOOGLE_CLIENT_ID) return false
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return !standalone
}

let loading: Promise<GoogleIdentity> | null = null

/** Fetch Google's library, once. Rejects if it is blocked, offline or slow. */
export function loadGoogle(): Promise<GoogleIdentity> {
  loading ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const ready = () => (window as WithGoogle).google?.accounts?.id
    const existing = ready()
    if (existing) return resolve(existing)
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    const timer = setTimeout(
      () => fail(new Error('Google sign-in took too long to load')),
      LOAD_TIMEOUT_MS,
    )
    const fail = (error: Error) => {
      clearTimeout(timer)
      script.remove()
      // Let a later visit to the form try again.
      loading = null
      reject(error)
    }
    script.onload = () => {
      const identity = ready()
      if (!identity) return fail(new Error('Google sign-in did not start'))
      clearTimeout(timer)
      resolve(identity)
    }
    script.onerror = () => fail(new Error('Google sign-in could not be loaded'))
    document.head.append(script)
  })
  return loading
}

/** The SHA-256 of some text, as lowercase hex. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * A one-time value that ties Google's token to this sign-in attempt. Google
 * is given its hash and writes that into the token; the account service is
 * given the original and checks the two match, so a token lifted from
 * somewhere else is no use.
 */
export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  return { raw, hashed: await sha256Hex(raw) }
}
