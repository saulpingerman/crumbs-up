import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * A newer version of the app takes over by itself (see vite.config.ts); this
 * reloads the page into it, with nothing to tap. The one wait is on the
 * rating screens: the reload happens as soon as someone leaves them, so a
 * cookie halfway through being rated isn't swapped out from under them.
 */
export function UpdatePrompt() {
  const [stale, setStale] = useState(false)
  useRegisterSW({
    onNeedReload: () => setStale(true),
    // Look again whenever the app comes back to the front, not only when it
    // is opened from scratch: on a phone it is mostly brought back.
    onRegisteredSW(_url, registration) {
      if (!registration) return
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => {})
      })
    },
  })
  const rating = useLocation().pathname.startsWith('/rate')

  useEffect(() => {
    if (stale && !rating) window.location.reload()
  }, [stale, rating])

  return null
}
