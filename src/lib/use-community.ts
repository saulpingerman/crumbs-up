import { useEffect, useState } from 'react'
import { cloudConfigured } from '@/lib/cloud/client'
import type { CommunityCookie } from '@/lib/community'

export type Community =
  | { status: 'loading' }
  | { status: 'ready'; cookies: CommunityCookie[] }
  /** This copy of the app, or its project, has no totals to show. */
  | { status: 'off' }
  | { status: 'failed' }

/** Everyone's ratings added up, fetched when a screen first asks for them. */
export function useCommunity(): Community {
  const [state, setState] = useState<Community>(
    cloudConfigured ? { status: 'loading' } : { status: 'off' },
  )
  useEffect(() => {
    if (!cloudConfigured) return
    let cancelled = false
    void import('@/lib/cloud/community').then(
      async ({ fetchCommunity, CommunityUnavailableError }) => {
        try {
          const cookies = await fetchCommunity()
          if (!cancelled) setState({ status: 'ready', cookies })
        } catch (error) {
          if (cancelled) return
          if (!(error instanceof CommunityUnavailableError)) console.warn(error)
          setState({ status: error instanceof CommunityUnavailableError ? 'off' : 'failed' })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [])
  return state
}
