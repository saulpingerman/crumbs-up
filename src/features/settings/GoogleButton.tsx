import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GOOGLE_CLIENT_ID, loadGoogle, makeNonce } from '@/lib/cloud/google'

interface Props {
  dark: boolean
  /**
   * Someone picked their Google account. `nonce` is the one-time value the
   * account service needs to check the token against.
   */
  onCredential: (token: string, nonce: string) => void
  /** Shown while Google's button loads, and for good if it can't be. */
  fallback: ReactNode
}

/**
 * Google's own "Continue with Google" button. Google draws it and opens its
 * sign-in box from it, which is what lets that box say "crumbs-up.com".
 * Until it has loaded — or if a content blocker or a dead connection means
 * it never does — the app's own button stands in, and signs in the long way
 * round.
 */
export function GoogleButton({ dark, onCredential, fallback }: Props) {
  const holder = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const latest = useRef(onCredential)
  useEffect(() => {
    latest.current = onCredential
  }, [onCredential])
  /** Bumped after each use: a one-time value is spent once Google has seen it. */
  const [round, setRound] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [google, nonce] = await Promise.all([loadGoogle(), makeNonce()])
        const parent = holder.current
        if (cancelled || !parent) return
        google.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: nonce.hashed,
          ux_mode: 'popup',
          auto_select: false,
          itp_support: true,
          callback: (response) => {
            latest.current(response.credential, nonce.raw)
            setRound((n) => n + 1)
          },
        })
        parent.replaceChildren()
        google.renderButton(parent, {
          type: 'standard',
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'center',
          // Google takes a width in pixels, between 200 and 400. The holder is
          // hidden until the button is in it, so measure the space around it.
          width: Math.max(200, Math.min(400, Math.floor(parent.parentElement?.clientWidth ?? 0))),
        })
        setReady(true)
      } catch (error) {
        console.warn('Google’s sign-in button is unavailable', error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dark, round])

  return (
    <>
      {/* Google's button is 44px tall including its own margin; the holder keeps
          that height so nothing shifts when it arrives. */}
      <div
        ref={holder}
        data-testid="google-button"
        className={
          ready ? 'flex min-h-11 items-center justify-center [color-scheme:light]' : 'hidden'
        }
      />
      {!ready && fallback}
    </>
  )
}
