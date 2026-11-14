import { BarChart3, BookOpen, Map as MapIcon, Plus, Settings2 } from 'lucide-react'
import { NavLink, Outlet, ScrollRestoration } from 'react-router'
import { ButtonLink } from '@/components/Button'
import { Wordmark } from '@/components/Logo'
import { cn } from '@/lib/cn'

const TABS = [
  { to: '/', label: 'Journal', icon: BookOpen, end: true },
  { to: '/map', label: 'Map', icon: MapIcon, end: false },
  { to: '/insights', label: 'Insights', icon: BarChart3, end: false },
  { to: '/settings', label: 'Settings', icon: Settings2, end: false },
] as const

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-cocoa focus:px-4 focus:py-2 focus:text-on-cocoa"
      >
        Skip to content
      </a>

      {/* Desktop / tablet: top bar */}
      <header className="sticky top-0 z-30 hidden border-b border-line/70 bg-cream/85 backdrop-blur-lg md:block">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-8 px-6">
          <NavLink to="/" aria-label="Crumbs Up home" className="rounded-lg">
            <Wordmark />
          </NavLink>
          <nav aria-label="Main" className="flex flex-1 items-center gap-1">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-full px-4 py-2 text-[15px] font-semibold transition',
                    isActive ? 'bg-oat text-ink' : 'text-ink-soft hover:text-ink',
                  )
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
          <ButtonLink to="/rate">
            <Plus className="size-4" strokeWidth={2.6} />
            Rate a cookie
          </ButtonLink>
        </div>
      </header>

      {/* Phone: brand strip */}
      <header className="pt-safe md:hidden">
        <div className="flex h-14 items-center px-4">
          <NavLink to="/" aria-label="Crumbs Up home" className="rounded-lg">
            <Wordmark />
          </NavLink>
        </div>
      </header>

      <main id="main" className="flex-1 pb-28 md:pb-0">
        <Outlet />
      </main>

      {/* Phone: tab bar with the rate button in the middle */}
      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line/80 bg-paper/92 backdrop-blur-lg md:hidden"
      >
        <div className="relative mx-auto grid h-16 max-w-md grid-cols-5 items-stretch px-1">
          <Tab {...TABS[0]} />
          <Tab {...TABS[1]} />
          <div className="flex items-start justify-center">
            <NavLink
              to="/rate"
              aria-label="Rate a cookie"
              className="-mt-6 flex size-16 items-center justify-center rounded-full bg-cocoa text-on-cocoa shadow-pop ring-4 ring-cream transition active:scale-95"
            >
              <Plus className="size-7" strokeWidth={2.4} />
            </NavLink>
          </div>
          <Tab {...TABS[2]} />
          <Tab {...TABS[3]} />
        </div>
      </nav>

      <ScrollRestoration />
    </div>
  )
}

function Tab({ to, label, icon: Icon, end }: (typeof TABS)[number]) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition',
          isActive ? 'text-ink' : 'text-ink-faint',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'flex h-7 w-12 items-center justify-center rounded-full transition',
              isActive && 'bg-oat',
            )}
          >
            <Icon className="size-[22px]" strokeWidth={isActive ? 2.3 : 1.9} />
          </span>
          {label}
        </>
      )}
    </NavLink>
  )
}
