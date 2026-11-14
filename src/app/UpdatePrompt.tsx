import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Service-worker updates are applied only when asked. Swapping the app out
 * from under someone halfway through rating a cookie would be rude.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    if (!needRefresh) return
    toast('A fresh batch is ready', {
      id: 'app-update',
      description: 'Update to get the newest version of Crumbs Up.',
      duration: Infinity,
      action: { label: 'Update', onClick: () => void updateServiceWorker(true) },
    })
  }, [needRefresh, updateServiceWorker])

  return null
}
