import { Navigate } from 'react-router'
import { Page } from '@/components/Page'
import { useSession } from '@/lib/cloud/session'
import { AccountCard } from './AccountCard'

/**
 * Where the header's "Sign in" button leads, and what it turns into once
 * someone has: their account, how the sync is doing, and the way out.
 */
export function AccountPage() {
  const session = useSession()
  // A copy of the app without accounts has no button to get here.
  if (session.status === 'off') return <Navigate to="/" replace />
  return (
    <Page title={session.status === 'signed-out' ? 'Sign in' : 'Account'} className="max-w-md">
      <AccountCard />
    </Page>
  )
}
