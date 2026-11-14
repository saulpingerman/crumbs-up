import { isRouteErrorResponse, useRouteError } from 'react-router'
import { Button, ButtonLink } from '@/components/Button'
import { LogoMark } from '@/components/Logo'
import { Empty } from '@/components/Page'

export function NotFound() {
  return (
    <Empty
      title="Nothing but crumbs"
      art={<LogoMark className="size-20 opacity-60" />}
      action={<ButtonLink to="/">Back to the journal</ButtonLink>}
    >
      That page doesn’t exist — it may have been a cookie you deleted.
    </Empty>
  )
}

export function RouteError() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />
  console.error(error)
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Empty
        title="That didn’t go to plan"
        art={<LogoMark className="size-20 opacity-60" />}
        action={
          <>
            <Button onClick={() => window.location.reload()}>Reload the app</Button>
            <a
              href={import.meta.env.BASE_URL}
              className="text-sm font-semibold text-ink-soft underline"
            >
              Go to the journal
            </a>
          </>
        }
      >
        Something broke on this screen. Your cookies are safe on this device — reloading usually
        sorts it out.
      </Empty>
    </div>
  )
}

export function StorageUnavailable() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Empty
        title="This browser won’t let us save"
        art={<LogoMark className="size-20 opacity-60" />}
        action={<Button onClick={() => window.location.reload()}>Try again</Button>}
      >
        Crumbs Up keeps your journal in this browser’s storage, and that storage is switched off
        here — usually because of private browsing. Open the app in a regular window and your
        cookies will be right where you left them.
      </Empty>
    </div>
  )
}
