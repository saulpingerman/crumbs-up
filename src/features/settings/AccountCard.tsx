import { Cloud, CloudOff, LoaderCircle, LogOut, RefreshCw, TriangleAlert } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/Button'
import { Field, TextInput } from '@/components/Field'
import { Card, SectionTitle } from '@/components/Page'
import { Sheet } from '@/components/Sheet'
import { requestSync, useSyncStatus } from '@/lib/cloud/auto'
import { providers, type Provider } from '@/lib/cloud/client'
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
import { plural } from '@/lib/format'

const PROVIDER_NAME: Record<Provider, string> = { google: 'Google', apple: 'Apple' }
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
          {providers.map((provider) => (
            <Button
              key={provider}
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void attempt(provider, () => signInWith(provider))}
            >
              {busy === provider && <LoaderCircle className="size-4 animate-spin" />}
              Continue with {PROVIDER_NAME[provider]}
            </Button>
          ))}
          <p className="mt-1 text-center text-xs font-semibold tracking-wider text-ink-faint uppercase">
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
      // Send anything unsent first, so removing the device copy loses nothing.
      if (removeJournal && status.pending > 0) await requestSync()
      await signOut()
      // A journal kept on the device stays linked to its account, so that a
      // different person signing in here is asked before anything is mixed.
      if (removeJournal) await forgetAccount(db, true)
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
