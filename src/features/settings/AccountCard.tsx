import { Cloud, CloudOff, LoaderCircle, LogOut, RefreshCw, TriangleAlert } from 'lucide-react'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/Button'
import { Field, TextInput } from '@/components/Field'
import { Card, SectionTitle } from '@/components/Page'
import { Sheet } from '@/components/Sheet'
import { requestSync, syncEverything, useSyncStatus, withoutSyncing } from '@/lib/cloud/auto'
import { useProviders, type Provider } from '@/lib/cloud/providers'
import {
  AuthError,
  sendPasswordReset,
  setNewPassword,
  signInWith,
  signInWithPassword,
  signOut,
  signUp,
  useRecovering,
  useSession,
} from '@/lib/cloud/session'
import { forgetAccount } from '@/lib/cloud/sync'
import { db } from '@/lib/db/db'
import { cn } from '@/lib/cn'
import { plural } from '@/lib/format'

/**
 * Each company's sign-in button, drawn the way its guidelines ask: Apple's
 * black (white on a dark screen) with its logo, Google's white with a grey
 * outline (near-black on a dark screen) and the four-color G.
 */
const PROVIDER_BUTTON: Record<Provider, { name: string; className: string; mark: ReactNode }> = {
  apple: {
    name: 'Apple',
    className:
      'bg-black text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/90',
    mark: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="-mt-0.5 size-[18px]">
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
      </svg>
    ),
  },
  google: {
    name: 'Google',
    className:
      'border border-[#747775] bg-white text-[#1f1f1f] hover:bg-[#f2f2f2] dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:hover:bg-[#1f1f20]',
    mark: (
      <svg viewBox="0 0 48 48" aria-hidden className="size-[18px]">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
    ),
  },
}
const MIN_PASSWORD = 8

const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** Sign in to back the journal up and keep it in step across devices. */
export function AccountCard() {
  const session = useSession()
  const recovering = useRecovering()
  if (session.status === 'off') return null

  return (
    <Card>
      <SectionTitle>Account</SectionTitle>
      {session.status === 'loading' && (
        <p className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
          <LoaderCircle className="size-4 animate-spin" /> Checking…
        </p>
      )}
      {session.status === 'signed-out' && <SignIn />}
      {session.status === 'signed-in' &&
        (recovering ? <NewPassword /> : <SignedIn email={session.email} />)}
    </Card>
  )
}

function SignIn() {
  const id = useId()
  const providers = useProviders()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'in' | 'up' | 'reset' | Provider | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  async function attempt(kind: NonNullable<typeof busy>, action: () => Promise<string | void>) {
    setBusy(kind)
    setProblem(null)
    setNotice(null)
    try {
      const message = await action()
      if (message) setNotice(message)
    } catch (error) {
      setProblem(error instanceof AuthError ? error.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const valid = /\S+@\S+\.\S+/.test(email)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || !password) {
      setProblem('Enter your email and password.')
      return
    }
    void attempt('in', () => signInWithPassword(email.trim(), password))
  }

  function create() {
    if (!valid) return setProblem('Enter your email address.')
    if (password.length < MIN_PASSWORD) {
      return setProblem(`Choose a password of at least ${MIN_PASSWORD} characters.`)
    }
    void attempt('up', async () =>
      (await signUp(email.trim(), password)) === 'confirm'
        ? 'Almost there — check your inbox and tap the link to confirm your email.'
        : undefined,
    )
  }

  function reset() {
    if (!valid)
      return setProblem('Enter your email address first, then tap “Forgot password?” again.')
    void attempt('reset', async () => {
      await sendPasswordReset(email.trim())
      return 'If there’s an account for that address, a reset link is on its way.'
    })
  }

  return (
    <>
      <p className="mt-1 text-sm text-ink-soft">
        Sign in to keep your journal backed up and in step between your phone and computer.
        Everything already on this device comes with you.
      </p>

      {providers.length > 0 && (
        <div className="mt-4 grid gap-2">
          {providers.map((provider) => {
            const { name, className, mark } = PROVIDER_BUTTON[provider]
            return (
              <button
                key={provider}
                type="button"
                disabled={busy !== null}
                onClick={() => void attempt(provider, () => signInWith(provider))}
                className={cn(
                  'inline-flex h-11 items-center justify-center gap-2.5 rounded-full px-5 text-[15px] font-semibold whitespace-nowrap transition-[transform,background-color,opacity] duration-150 select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45',
                  className,
                )}
              >
                {busy === provider ? <LoaderCircle className="size-[18px] animate-spin" /> : mark}
                Continue with {name}
              </button>
            )
          })}
          <p className="mt-2 flex items-center gap-3 text-xs font-semibold tracking-wider text-ink-faint uppercase before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
            or with email
          </p>
        </div>
      )}

      <form onSubmit={submit} noValidate className="mt-4 space-y-3">
        <Field label="Email" htmlFor={`${id}-email`}>
          <TextInput
            id={`${id}-email`}
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor={`${id}-password`}>
          <TextInput
            id={`${id}-password`}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {problem && (
          <p role="alert" className="text-sm font-medium text-danger">
            {problem}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-xl bg-look-soft px-3 py-2 text-sm font-medium">
            {notice}
          </p>
        )}

        <div className="grid gap-2 pt-1 sm:grid-cols-2">
          <Button type="submit" disabled={busy !== null}>
            {busy === 'in' && <LoaderCircle className="size-4 animate-spin" />}
            Sign in
          </Button>
          <Button variant="secondary" disabled={busy !== null} onClick={create}>
            {busy === 'up' && <LoaderCircle className="size-4 animate-spin" />}
            Create account
          </Button>
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={busy !== null}
          className="text-sm font-semibold text-ink-soft underline underline-offset-4 hover:text-ink"
        >
          Forgot password?
        </button>
      </form>
    </>
  )
}

function NewPassword() {
  const id = useId()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password.length < MIN_PASSWORD) {
      setProblem(`Choose a password of at least ${MIN_PASSWORD} characters.`)
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await setNewPassword(password)
      toast.success('Password changed')
    } catch (error) {
      setProblem(error instanceof AuthError ? error.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="mt-3 space-y-3">
      <p className="text-sm text-ink-soft">Choose a new password to finish resetting it.</p>
      <Field label="New password" htmlFor={`${id}-new`} error={problem ?? undefined}>
        <TextInput
          id={`${id}-new`}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(problem)}
        />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy && <LoaderCircle className="size-4 animate-spin" />}
        Save new password
      </Button>
    </form>
  )
}

function SignedIn({ email }: { email: string }) {
  const status = useSyncStatus()
  const [leaving, setLeaving] = useState(false)
  const [busy, setBusy] = useState(false)

  async function leave(removeJournal: boolean) {
    setBusy(true)
    try {
      // The device may hold changes the account doesn't have yet. Send them
      // first, and if that can't be done, don't remove what may be the only copy.
      if (removeJournal && !(await syncEverything())) {
        toast.error('Some cookies haven’t reached your account yet', {
          description: 'Check your connection and try again, or keep the journal on this device.',
          duration: 10_000,
        })
        return
      }
      await withoutSyncing(async () => {
        // Clear first, sign out second. If this is cut short — the app is
        // closed, the connection drops — the device is still signed in and
        // the journal simply comes back, rather than a journal being left
        // on a device that was meant to be cleared.
        // (A journal that is kept stays linked to its account, so a different
        // person signing in here is asked before anything is mixed.)
        if (removeJournal) await forgetAccount(db, true)
        await signOut()
      })
      toast(removeJournal ? 'Signed out and removed from this device' : 'Signed out')
      setLeaving(false)
    } catch (error) {
      toast.error(error instanceof AuthError ? error.message : 'Couldn’t sign out')
    } finally {
      setBusy(false)
    }
  }

  /** Resolve "this device holds another account's journal", one way or the other. */
  async function resolve(how: 'replace' | 'merge') {
    setBusy(true)
    try {
      // Either way the device is unlinked first; `replace` also clears it.
      await forgetAccount(db, how === 'replace')
      await requestSync()
      toast.success(
        how === 'replace'
          ? 'This device now shows this account’s journal'
          : 'This device’s journal was added to this account',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="mt-1 text-sm text-ink-soft">
        Signed in as{' '}
        <strong className="font-semibold [overflow-wrap:anywhere] text-ink">{email}</strong>
      </p>

      {status.phase === 'other-account' ? (
        <div className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <TriangleAlert className="size-4 shrink-0" /> This device holds a different account’s
            journal
          </p>
          <p className="mt-1 text-ink-soft">
            To avoid mixing two journals by accident, nothing has been synced yet. Replace what’s on
            this device with this account’s journal, add this device’s cookies to this account, or
            sign out and leave things as they are. The other account’s journal stays safe in the
            cloud whichever you choose.
          </p>
          {status.pending > 0 && (
            <p className="mt-2 font-medium text-ink">
              {plural(status.pending, 'change')} on this device never reached that account.
              Replacing the journal discards {status.pending === 1 ? 'it' : 'them'}.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => void resolve('replace')}
            >
              Replace this device’s journal
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void resolve('merge')}
            >
              Add its cookies to this account
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p
            role="status"
            className="mt-4 flex items-start gap-2.5 rounded-2xl bg-oat px-4 py-3 text-sm"
          >
            {status.phase === 'syncing' ? (
              <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" />
            ) : status.phase === 'idle' ? (
              <Cloud className="mt-0.5 size-4 shrink-0 text-ok" />
            ) : (
              <CloudOff className="mt-0.5 size-4 shrink-0 text-ink-soft" />
            )}
            <span>
              <span className="block font-semibold">
                {status.phase === 'syncing' && 'Syncing…'}
                {status.phase === 'offline' && 'Offline — will sync when you’re back online'}
                {status.phase === 'error' && 'Couldn’t sync just now'}
                {status.phase === 'idle' &&
                  (status.pending > 0 ? 'Changes waiting to sync' : 'Everything is synced')}
              </span>
              <span className="block text-ink-soft">
                {status.pending > 0 &&
                  `${plural(status.pending, 'change')} on this device to send. `}
                {status.lastSyncedAt
                  ? `Last synced ${time.format(new Date(status.lastSyncedAt))}.`
                  : 'Not synced yet.'}
                {status.phase === 'error' && status.error ? ` (${status.error})` : ''}
              </span>
            </span>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={status.phase === 'syncing'}
              onClick={() => void requestSync()}
            >
              <RefreshCw className="size-4" />
              Sync now
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLeaving(true)}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </>
      )}

      <Sheet
        open={leaving}
        onOpenChange={setLeaving}
        title="Sign out"
        description="Your journal stays safe in your account either way. What should happen to the copy on this device?"
      >
        <div className="grid gap-2">
          <Button disabled={busy} onClick={() => void leave(false)}>
            Keep the journal on this device
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void leave(true)}>
            Remove it from this device
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setLeaving(false)}>
            Stay signed in
          </Button>
        </div>
      </Sheet>
    </>
  )
}
