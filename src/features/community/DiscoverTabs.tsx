import { NavLink } from 'react-router'
import { cloudConfigured } from '@/lib/cloud/client'
import { cn } from '@/lib/cn'

const TABS = [
  { to: '/discover', label: 'For you' },
  { to: '/top', label: 'Top rated' },
]

/**
 * The two halves of Discover: suggestions from your own ratings, and what
 * everyone has rated highest. Only shown where there is an "everyone" — a
 * copy of the app with accounts.
 */
export function DiscoverTabs() {
  if (!cloudConfigured) return null
  return (
    <nav aria-label="Discover" className="inline-flex rounded-full bg-oat p-1">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            cn(
              'flex h-9 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition',
              isActive ? 'bg-paper text-ink shadow-card' : 'text-ink-soft hover:text-ink',
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
