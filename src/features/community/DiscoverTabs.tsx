import { NavLink } from 'react-router'
import { cloudConfigured } from '@/lib/cloud/client'
import { cn } from '@/lib/cn'

const TABS = [
  { to: '/discover', label: 'For you', everyone: false },
  { to: '/top', label: 'Top rated', everyone: true },
  { to: '/want-to-go', label: 'Want to go', everyone: false },
]

/**
 * The parts of Discover: suggestions from your own ratings, what everyone
 * has rated highest (only where there is an "everyone": a copy of the app
 * with accounts), and the places saved to go to.
 */
export function DiscoverTabs() {
  return (
    <nav aria-label="Discover" className="inline-flex rounded-full bg-oat p-1">
      {TABS.filter((tab) => cloudConfigured || !tab.everyone).map((tab) => (
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
