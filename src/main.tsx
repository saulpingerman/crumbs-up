import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { App } from './app/App'
import { toast } from 'sonner'
import { cloudConfigured } from './lib/cloud/client'
import { applyTheme, watchSystemTheme } from './lib/settings'

applyTheme()
watchSystemTheme()

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
          description: 'Sign in from Settings, or ask for a fresh link there.',
          duration: 12_000,
        }),
    }),
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
