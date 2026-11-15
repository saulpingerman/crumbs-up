import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { App } from './app/App'
import { toast } from 'sonner'
import { cloudConfigured } from './lib/cloud/client'
import { applyTheme, watchSystemTheme } from './lib/settings'

applyTheme()
watchSystemTheme()

// A page left open across a new version can ask for a piece of the old one
// that is no longer there. Reload into the new version rather than break,
// but only once in a short while, so a piece that is genuinely missing
// can't send the page round in circles.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'crumbs-up:reloaded-for-update'
  const last = Number(sessionStorage.getItem(key) ?? 0)
  if (Date.now() - last < 30_000) return
  event.preventDefault()
  sessionStorage.setItem(key, String(Date.now()))
  window.location.reload()
})

// Accounts are optional: only when a Supabase project is configured does the
// app look for a session and start syncing.
if (cloudConfigured) {
  const welcome = () => toast.success('Signed in')
  void import('./lib/cloud/auto').then(({ startAutoSync }) =>
    startAutoSync({
      onSignedIn: welcome,
      onLinkSignIn: welcome,
      onLinkFailed: () =>
        toast.error('That link has expired or was already used', {
          description: 'Tap Sign in to try again.',
          duration: 12_000,
        }),
    }),
  )
}

// The sample journal is for trying things out, not for people's real
// journals: there is no button for it. Tests and local development reach it
// through this hook, which a normal build leaves out.
if (import.meta.env.DEV || import.meta.env.VITE_E2E) {
  ;(window as unknown as { crumbsUpSamples?: () => Promise<number> }).crumbsUpSamples = async () =>
    (await import('./lib/samples')).addSampleCookies()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
