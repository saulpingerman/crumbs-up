import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * A newer version of the app takes over by itself (see vite.config.ts); this
 * decides when the page reloads into it. Straight away, unless someone is in
 * the middle of rating a cookie: there they are asked, and the reload waits
 * until they tap it or leave the rating screens.
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
    if (!stale) return
    if (!rating) {
      window.location.reload()
      return
    }
    toast('A fresh batch is ready', {
      id: 'app-update',
      description: 'Update to get the newest version of Crumbs Up.',
      duration: Infinity,
      action: { label: 'Update', onClick: () => window.location.reload() },
    })
  }, [stale, rating])

  return null
}
