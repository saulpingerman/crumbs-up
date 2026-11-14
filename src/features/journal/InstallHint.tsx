import { ArchiveRestore, Share, Smartphone, X } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/Button'
import { promptInstall, useInstallState } from '@/lib/install'
import { updateSettings, useSettings } from '@/lib/settings'

/**
 * Nudge toward installing. It matters beyond convenience: Safari clears a
 * website's saved data after a week without a visit, but not an installed
 * app's — and this app keeps the whole journal on the device.
 */
export function InstallHint() {
  const state = useInstallState()
  const { installHintDismissed } = useSettings()
  if (installHintDismissed || state === 'installed' || state === 'unavailable') return null

  return (
    <aside className="mb-5 flex items-start gap-3 rounded-2xl border border-line bg-paper p-4 shadow-card">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-texture-soft text-texture-ink">
        <Smartphone className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Keep Crumbs Up on your home screen</p>
        {state === 'ios' ? (
          <p className="mt-0.5 text-sm text-ink-soft">
            Tap <Share aria-label="Share" className="inline size-4 align-[-3px]" /> then{' '}
            <strong className="font-semibold text-ink">Add to Home Screen</strong>. It opens like an
            app, works offline, and keeps your journal from being cleared by Safari.
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-sm text-ink-soft">
              Install it to open like an app, work offline and keep your journal safe.
            </p>
            <Button size="sm" className="mt-3" onClick={() => void promptInstall()}>
              Install app
            </Button>
          </>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => updateSettings({ installHintDismissed: true })}
        className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-oat hover:text-ink"
      >
        <X className="size-4" />
      </button>
    </aside>
  )
}

const NUDGE_AFTER = 5

/**
 * The journal only exists on this device, so after a handful of new cookies
 * it is worth a gentle reminder that a backup is the only other copy.
 */
export function BackupNudge() {
  const { changesSinceBackup } = useSettings()
  if (changesSinceBackup < NUDGE_AFTER) return null
  return (
    <Link
      to="/settings"
      className="mb-5 flex items-center gap-3 rounded-2xl border border-line bg-paper p-4 shadow-card transition hover:bg-oat"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-look-soft text-look-ink">
        <ArchiveRestore className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Time for a backup</span>
        <span className="block text-sm text-ink-soft">
          {changesSinceBackup} changes since your last one. It takes a few seconds in Settings.
        </span>
      </span>
    </Link>
  )
}
