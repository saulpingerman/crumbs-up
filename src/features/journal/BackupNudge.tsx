import { ArchiveRestore } from 'lucide-react'
import { Link } from 'react-router'
import { useSettings } from '@/lib/settings'

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
