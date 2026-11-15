import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart3, BookOpen, Compass, Map as MapIcon, Plus, Settings } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigation } from 'react-router'
import { ButtonLink } from '@/components/Button'
import type { HomeState } from '@/features/journal/JournalPage'
import { Wordmark } from '@/components/Logo'
import { useSession } from '@/lib/cloud/session'
import { cn } from '@/lib/cn'
import { db } from '@/lib/db/db'

const TABS = [
  { to: '/', label: 'Journal', icon: BookOpen, end: true, also: [] },
  { to: '/map', label: 'Map', icon: MapIcon, end: false, also: [] },
  // Top rated and Want to go are parts of Discover, so they keep this tab lit.
  { to: '/discover', label: 'Discover', icon: Compass, end: false, also: ['/top', '/want-to-go'] },
  { to: '/insights', label: 'Insights', icon: BarChart3, end: false, also: [] },
] as const

export function AppShell() {
  // Each tab's code is fetched the first time it is opened. On a slow
  // connection that takes a moment, and something should be seen to happen.
  const loading = useNavigation().state === 'loading'
  const { pathname } = useLocation()
  // With nothing in the journal yet, the + button quietly asks to be pressed.
  const beckon = useLiveQuery(() => db.cookies.count()) === 0
  return (
    <div className="flex min-h-dvh flex-col">
      {loading && (
        <div
          role="progressbar"
          aria-label="Loading"
          className="fixed inset-x-0 top-0 z-50 h-[3px] animate-fade overflow-hidden bg-crust/15 [animation-delay:150ms]"
        >
          <div className="h-full w-2/5 animate-sweep rounded-full bg-crust" />
        </div>
      )}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-cocoa focus:px-4 focus:py-2 focus:text-on-cocoa"
      >
        Skip to content
      </a>

      {/* Desktop / tablet: top bar */}
      <header className="sticky top-0 z-30 hidden border-b border-line/70 bg-cream/85 backdrop-blur-lg md:block">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-8 px-6">
          <HomeLink />
          <nav aria-label="Main" className="flex flex-1 items-center gap-1">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-full px-4 py-2 text-[15px] font-semibold transition',
                    isActive || t.also.some((path) => pathname.startsWith(path))
                      ? 'bg-oat text-ink'
                      : 'text-ink-soft hover:text-ink',
                  )
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
          <AccountLink />
          <ButtonLink to="/rate">
            <Plus className="size-4" strokeWidth={2.6} />
            Rate a cookie
          </ButtonLink>
        </div>
      </header>

      {/* Phone: brand strip */}
      <header className="pt-safe md:hidden">
        <div className="flex h-14 items-center justify-between pr-2 pl-4">
          <HomeLink />
          <AccountLink />
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
          <div className="relative flex items-start justify-center">
            {beckon && (
              <span
                aria-hidden
                data-testid="beckon"
                className="pointer-events-none absolute -top-6 size-16 animate-beckon rounded-full bg-cocoa"
              />
            )}
            <NavLink
              to="/rate"
              aria-label="Rate a cookie"
              className="relative -mt-6 flex size-16 items-center justify-center rounded-full bg-cocoa text-on-cocoa shadow-pop ring-4 ring-cream transition active:scale-95"
            >
              <Plus className="size-7" strokeWidth={2.4} />
            </NavLink>
          </div>
          <Tab {...TABS[2]} />
          <Tab {...TABS[3]} />
        </div>
      </nav>
    </div>
  )
}

/** The logo: back to the journal as it first opens, from anywhere, at the top. */
function HomeLink() {
  const home: HomeState = { home: true }
  return (
    <Link
      to="/"
      state={home}
      aria-label="Crumbs Up home"
      className="rounded-lg"
      onClick={() => window.scrollTo({ top: 0 })}
    >
      <Wordmark />
    </Link>
  )
}

/**
 * The one button in the corner. Signing in used to hide behind a settings
 * symbol, which says nothing about accounts, so it is in words: "Sign in",
 * and "Account" once someone has. The settings are on the page it opens.
 * A copy of the app with no accounts has only settings, behind a gear.
 */
function AccountLink() {
  const session = useSession()
  const { pathname } = useLocation()
  if (session.status === 'off') {
    return (
      <NavLink
        to="/settings"
        aria-label="Settings"
        title="Settings"
        className={({ isActive }) =>
          cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full transition hover:bg-oat hover:text-ink',
            isActive ? 'bg-oat text-ink' : 'text-ink-soft',
          )
        }
      >
        <Settings className="size-[22px]" />
      </NavLink>
    )
  }
  // Nothing while it is still being worked out: a "Sign in" that flips to
  // "Account" a moment later is worse than a short gap.
  if (session.status === 'loading') return null
  // Lit on its own page under either address, and on the pages that hang off it.
  const here = pathname === '/settings' || pathname.startsWith('/account')
  return (
    <NavLink
      to="/account"
      className={cn(
        'mr-2 flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition md:mr-0',
        here ? 'border-transparent bg-oat text-ink' : 'border-line bg-paper text-ink hover:bg-oat',
      )}
    >
      {session.status === 'signed-in' ? 'Account' : 'Sign in'}
    </NavLink>
  )
}

function Tab({ to, label, icon: Icon, end, also }: (typeof TABS)[number]) {
  const { pathname } = useLocation()
  const alsoHere = also.some((path) => pathname.startsWith(path))
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive, isPending }) =>
        cn(
          'flex flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition',
          isActive || isPending || alsoHere ? 'text-ink' : 'text-ink-faint',
        )
      }
    >
      {/* A tab lights up the moment it is tapped, not when its page arrives. */}
      {({ isActive, isPending }) => (
        <>
          <span
            className={cn(
              'flex h-7 w-12 items-center justify-center rounded-full transition',
              (isActive || isPending || alsoHere) && 'bg-oat',
            )}
          >
            <Icon
              className="size-[22px]"
              strokeWidth={isActive || isPending || alsoHere ? 2.3 : 1.9}
            />
          </span>
          {label}
        </>
      )}
    </NavLink>
  )
}
