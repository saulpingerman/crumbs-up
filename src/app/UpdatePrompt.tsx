import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * When a newer version of the app is found, switch to it straight away,
 * unless someone is in the middle of rating a cookie: swapping the app out
 * from under them there would be rude, so they are asked instead. Left to
 * a prompt everywhere, a phone could go on running an old copy for days,
 * and a fix that is live wouldn't reach it.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
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
    if (!needRefresh) return
    if (!rating) {
      void updateServiceWorker(true)
      return
    }
    toast('A fresh batch is ready', {
      id: 'app-update',
      description: 'Update to get the newest version of Crumbs Up.',
      duration: Infinity,
      action: { label: 'Update', onClick: () => void updateServiceWorker(true) },
    })
  }, [needRefresh, rating, updateServiceWorker])

  return null
}
