import { useLiveQuery } from 'dexie-react-hooks'
import {
  Check,
  ChevronRight,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/Button'
import { Segmented } from '@/components/Field'
import { useSession } from '@/lib/cloud/session'
import { forgetAccount } from '@/lib/cloud/sync'
import { Card, Page, SectionTitle } from '@/components/Page'
import { Confirm } from '@/components/Sheet'
import { cn } from '@/lib/cn'
import { BackupError, downloadBlob, exportBackup, importBackup, toCsv } from '@/lib/db/backup'
import { deleteEverything, deleteSampleCookies } from '@/lib/db/cookies'
import { db, requestPersistentStorage } from '@/lib/db/db'
import { plural, todayIso } from '@/lib/format'
import { WEIGHT_PRESETS, type OverallPrecision, type WeightPreset } from '@/lib/rubric'
import { updateSettings, useSettings, weightsFor, type ThemeChoice } from '@/lib/settings'

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function SettingsPage() {
  const settings = useSettings()
  const signedIn = useSession().status === 'signed-in'

  return (
    <Page title="Settings" className="max-w-2xl">
      <div className="space-y-5">
        <Card>
          <SectionTitle>Overall score</SectionTitle>
          <div role="radiogroup" aria-label="Overall score weighting" className="mt-4 space-y-2">
            {(Object.keys(WEIGHT_PRESETS) as WeightPreset[]).map((key) => {
              const preset = WEIGHT_PRESETS[key]
              const on = settings.weightPreset === key
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => updateSettings({ weightPreset: key })}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3 text-left transition active:scale-[0.99]',
                    on ? 'border-crust bg-texture-soft' : 'border-line hover:border-ink-faint',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{preset.label}</span>
                    <span className="block text-sm text-ink-soft">{preset.detail}</span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px]',
                      on ? 'border-transparent bg-crust text-white dark:text-black' : 'border-line',
                    )}
                  >
                    {on && <Check className="size-4" strokeWidth={3} />}
                  </span>
                </button>
              )
            })}
          </div>

          <Row
            label="Round the overall to"
            hint="Category scores always move in half points."
            className="mt-5 border-t border-line/70 pt-4"
          >
            <Segmented<OverallPrecision>
              label="Overall score precision"
              value={settings.overallPrecision}
              onChange={(overallPrecision) => updateSettings({ overallPrecision })}
              options={[
                { value: 'half', label: 'Half points' },
                { value: 'tenth', label: 'Tenths' },
              ]}
            />
          </Row>

          <Link
            to="/guide"
            className="mt-4 flex items-center justify-between rounded-2xl bg-oat px-4 py-3 font-semibold transition hover:brightness-95 dark:hover:brightness-110"
          >
            How the scoring works
            <ChevronRight className="size-5 text-ink-soft" />
          </Link>
        </Card>

        <Card>
          <SectionTitle>Appearance</SectionTitle>
          <Row label="Theme" className="mt-3">
            <Segmented<ThemeChoice>
              label="Theme"
              value={settings.theme}
              onChange={(theme) => updateSettings({ theme })}
              options={[
                { value: 'system', label: 'Auto' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </Row>
        </Card>

        <Card>
          <SectionTitle>Photos</SectionTitle>
          <Row
            label="Cut cookies out of their photos"
            hint="Finds the cookie in each new photo and sets it on a clean tabletop. The original is always kept."
            className="mt-3 flex-nowrap items-start"
          >
            <Switch
              label="Cut cookies out of their photos"
              checked={settings.autoCutout}
              onChange={(autoCutout) => updateSettings({ autoCutout })}
            />
          </Row>
        </Card>

        <Card>
          <SectionTitle>Maps &amp; places</SectionTitle>
          <Row
            label="Look up bakeries online"
            hint="Pin a bakery’s exact spot as you type its name, and show bakeries you haven’t tried as you move around the map or pick a county or state."
            className="mt-3 flex-nowrap items-start"
          >
            <Switch
              label="Look up bakeries online"
              checked={settings.onlinePlaces}
              onChange={(onlinePlaces) => updateSettings({ onlinePlaces })}
            />
          </Row>
        </Card>

        <DataCard />

        <p className="px-2 text-center text-xs leading-relaxed text-ink-faint">
          Crumbs Up {__APP_VERSION__} ·{' '}
          {signedIn
            ? 'Your journal lives on this device and in your account.'
            : 'Your journal lives on this device and is never uploaded.'}{' '}
          <Link to="/privacy" className="font-semibold underline underline-offset-2">
            Privacy
          </Link>
        </p>
      </div>
    </Page>
  )
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative mt-0.5 h-8 w-14 shrink-0 rounded-full transition-colors',
        checked ? 'bg-crust' : 'bg-line',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-1 left-1 size-6 rounded-full bg-white shadow-card transition-transform',
          checked && 'translate-x-6',
        )}
      />
    </button>
  )
}

function Row({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        {hint && <p className="text-sm text-ink-soft">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function DataCard() {
  const settings = useSettings()
  const signedIn = useSession().status === 'signed-in'
  const counts = useLiveQuery(async () => {
    const all = await db.cookies.toArray()
    return { total: all.length, samples: all.filter((c) => c.sample).length }
  }, [])
  const [busy, setBusy] = useState<'export' | 'import' | 'samples' | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted)
  }, [])

  const total = counts?.total ?? 0
  const samples = counts?.samples ?? 0
  const mine = total - samples

  async function backUp() {
    setBusy('export')
    try {
      const { blob, filename, count } = await exportBackup({
        weights: weightsFor(settings),
        precision: settings.overallPrecision,
        skipSamples: true,
      })
      downloadBlob(blob, filename)
      updateSettings({ lastBackupAt: Date.now(), changesSinceBackup: 0 })
      toast.success(`Backed up ${plural(count, 'cookie')}`, {
        description:
          'Keep the .zip somewhere safe, like Files, iCloud Drive, Google Drive or email.',
      })
    } catch (error) {
      console.error(error)
      toast.error('The backup didn’t work')
    } finally {
      setBusy(null)
    }
  }

  async function spreadsheet() {
    const cookies = (await db.cookies.orderBy('eatenOn').toArray()).filter((c) => !c.sample)
    const csv = toCsv(cookies, weightsFor(settings), settings.overallPrecision)
    // The BOM makes Excel read the file as UTF-8.
    downloadBlob(new Blob(['﻿', csv], { type: 'text/csv' }), `crumbs-up-${todayIso()}.csv`)
  }

  async function restore(file: File | undefined) {
    if (!file) return
    setBusy('import')
    try {
      const result = await importBackup(file)
      const changed = result.added + result.updated
      toast.success(
        changed === 0 ? 'Already up to date' : `Restored ${plural(changed, 'cookie')}`,
        {
          description: [
            result.added && `${result.added} new`,
            result.updated && `${result.updated} updated`,
            result.unchanged && `${result.unchanged} already here`,
            result.skipped && `${result.skipped} unreadable`,
          ]
            .filter(Boolean)
            .join(' · '),
        },
      )
      void requestPersistentStorage().then(setPersisted)
    } catch (error) {
      toast.error(error instanceof BackupError ? error.message : 'Couldn’t read that backup')
    } finally {
      setBusy(null)
    }
  }

  async function removeSamples() {
    setBusy('samples')
    try {
      const removed = await deleteSampleCookies()
      toast(`Removed ${plural(removed, 'sample cookie')}`)
    } catch (error) {
      console.error(error)
      toast.error('That didn’t work')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <SectionTitle>Your journal</SectionTitle>
      <p className="mt-1 text-sm text-ink-soft">
        {plural(mine, 'cookie')} saved on this device
        {samples > 0 && ` (plus ${plural(samples, 'sample')})`}.{' '}
        {signedIn
          ? 'Your journal is also kept in your account, and a backup file is a third copy that is yours to keep.'
          : 'Nothing is sent anywhere, so a backup is the only other copy.'}
      </p>

      <div
        className={cn(
          'mt-4 rounded-2xl px-4 py-3 text-sm',
          settings.changesSinceBackup > 0 && mine > 0 ? 'bg-texture-soft' : 'bg-oat',
        )}
      >
        <p className="font-semibold">
          {settings.lastBackupAt
            ? `Last backup ${dateTime.format(settings.lastBackupAt)}`
            : 'No backup yet'}
        </p>
        <p className="text-ink-soft">
          {mine === 0
            ? 'Rate a cookie and you’ll have something to back up.'
            : settings.changesSinceBackup > 0
              ? `${plural(settings.changesSinceBackup, 'change')} ${settings.lastBackupAt ? 'since then' : 'so far'}. Back up after a good cookie run.`
              : 'Everything is backed up.'}
        </p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button onClick={() => void backUp()} disabled={busy !== null || mine === 0}>
          {busy === 'export' ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Back up journal
        </Button>
        <Button
          variant="secondary"
          onClick={() => fileInput.current?.click()}
          disabled={busy !== null}
        >
          {busy === 'import' ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          Restore from backup
        </Button>
        <Button variant="secondary" onClick={() => void spreadsheet()} disabled={mine === 0}>
          <FileSpreadsheet className="size-4" />
          Export spreadsheet
        </Button>
        {/* Sample cookies can no longer be added; this clears out any from before. */}
        {samples > 0 && (
          <Button variant="secondary" onClick={() => void removeSamples()} disabled={busy !== null}>
            {busy === 'samples' ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Remove sample cookies
          </Button>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".zip,application/zip"
        hidden
        data-testid="restore-input"
        onChange={(e) => {
          void restore(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {persisted !== null && (
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
          <ShieldCheck className="mt-px size-4 shrink-0" />
          {persisted
            ? 'This browser has promised to keep your journal even when storage runs low.'
            : 'This browser may clear saved data if the device runs low on space or the site goes unused. Installing the app and keeping a backup protects your journal.'}
        </p>
      )}

      <div className="mt-5 border-t border-line/70 pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:bg-danger-soft hover:text-danger"
          onClick={() => setConfirmWipe(true)}
          disabled={total === 0}
        >
          <Trash2 className="size-4" />
          Delete everything
        </Button>
      </div>

      <Confirm
        open={confirmWipe}
        onOpenChange={setConfirmWipe}
        title="Delete the whole journal?"
        description={
          <>
            All {plural(total, 'cookie')}, every photo and any unfinished rating will be erased from
            this device
            {signedIn && (
              <strong className="font-semibold text-ink">
                {' '}
                and from your account, on every device signed in to it
              </strong>
            )}
            . This can’t be undone. Make a backup first if you might want them back.
          </>
        }
        confirmLabel="Delete everything"
        destructive
        onConfirm={() => {
          // Signed in, the deletion is recorded so it reaches the account and
          // every other device. Signed out, it is this device and nothing
          // more — including any record that would delete things later, the
          // next time someone signs in here.
          void (signedIn ? deleteEverything() : forgetAccount(db, true)).then(() => {
            updateSettings({ changesSinceBackup: 0 })
            toast('Journal deleted')
          })
        }}
      />
    </Card>
  )
}
