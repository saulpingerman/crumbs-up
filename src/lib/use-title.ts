import { useEffect } from 'react'

const APP = 'Crumbs Up'

/** Set the browser tab / task-switcher title for the current screen. */
export function useTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP}` : `${APP} · Cookie Ratings`
  }, [title])
}
