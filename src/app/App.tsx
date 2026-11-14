import { useEffect, useState } from 'react'
import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router'
import { Toaster } from 'sonner'
import { JournalPage } from '@/features/journal/JournalPage'
import { db } from '@/lib/db/db'
import { useSettings } from '@/lib/settings'
import { AppShell } from './AppShell'
import { NotFound, RouteError, StorageUnavailable } from './Errors'
import { UpdatePrompt } from './UpdatePrompt'

const router = createBrowserRouter(
  [
    {
      element: <Root />,
      errorElement: <RouteError />,
      children: [
        {
          element: <AppShell />,
          children: [
            { index: true, element: <JournalPage /> },
            {
              path: 'map',
              lazy: async () => ({ Component: (await import('@/features/map/MapPage')).MapPage }),
            },
            {
              path: 'insights',
              lazy: async () => ({
                Component: (await import('@/features/insights/InsightsPage')).InsightsPage,
              }),
            },
            {
              path: 'settings',
              lazy: async () => ({
                Component: (await import('@/features/settings/SettingsPage')).SettingsPage,
              }),
            },
            {
              path: 'guide',
              lazy: async () => ({
                Component: (await import('@/features/guide/GuidePage')).GuidePage,
              }),
            },
            { path: '*', element: <NotFound /> },
          ],
        },
        {
          path: 'cookie/:id',
          lazy: async () => ({
            Component: (await import('@/features/cookie/CookiePage')).CookiePage,
          }),
        },
        {
          path: 'rate',
          lazy: async () => ({ Component: (await import('@/features/rate/RatePage')).RatePage }),
        },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
)

/**
 * Wraps every route so scroll positions are remembered across all of them —
 * opening a cookie and coming back returns to the same spot in the journal.
 */
function Root() {
  return (
    <>
      <Outlet />
      <ScrollRestoration />
    </>
  )
}

export function App() {
  const { theme } = useSettings()
  const [storageFailed, setStorageFailed] = useState(false)

  useEffect(() => {
    // Without IndexedDB (some private-browsing modes, locked-down browsers)
    // nothing could be saved, so say so plainly instead of showing a blank app.
    db.open().catch((error: unknown) => {
      console.error(error)
      setStorageFailed(true)
    })
  }, [])

  if (storageFailed) return <StorageUnavailable />

  return (
    <>
      <RouterProvider router={router} />
      <Toaster
        position="top-center"
        theme={theme}
        offset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
        mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
        toastOptions={{
          style: {
            background: 'var(--paper)',
            color: 'var(--ink)',
            border: '1px solid var(--line)',
            borderRadius: '16px',
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            boxShadow: 'var(--shadow-pop)',
          },
        }}
      />
      <UpdatePrompt />
    </>
  )
}
