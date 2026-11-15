import { LoaderCircle } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/Button'
import { Field, TextInput } from '@/components/Field'
import { readPending, rememberPending, type PendingCode } from '@/lib/cloud/pending-code'
import { sendPasswordReset, useRecovering, useSession } from '@/lib/cloud/session'
import type { AccountPageState } from './CreateAccountPage'
import { EnterCode } from './EnterCode'
import { AccountPage, Outcome } from './form'
import { useAttempt } from './use-attempt'
import { NewPassword } from './NewPassword'
import { looksLikeEmail } from './passwords'

/** Forgot password: the address, then the emailed code, then a new password. */
export function ResetPasswordPage() {
  const id = useId()
  const session = useSession()
  const recovering = useRecovering()
  const navigate = useNavigate()
  const arrived = useLocation().state as AccountPageState | null
  const [email, setEmail] = useState(arrived?.email ?? '')
  const [pending, setPending] = useState<PendingCode | null>(() => {
    const waiting = readPending()
    return waiting?.purpose === 'recovery' ? waiting : null
  })
  const [justAsked, setJustAsked] = useState(false)
  const { busy, problem, setProblem, attempt } = useAttempt<'send'>()

  const signedIn = session.status === 'signed-in'
  // Signed in with nothing left to choose: either the new password has just
  // been saved, or there was never anything to reset.
  const done = signedIn && !recovering
  useEffect(() => {
    if (signedIn) rememberPending(null)
    if (done) void navigate('/settings', { replace: true })
  }, [signedIn, done, navigate])

  if (session.status === 'off') return <Navigate to="/settings" replace />

  function awaitCode(next: PendingCode | null) {
    rememberPending(next)
    setPending(next)
    setJustAsked(next !== null)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!looksLikeEmail(email)) return setProblem('Enter your email address.')
    void attempt('send', async () => {
      await sendPasswordReset(email.trim())
      awaitCode({ email: email.trim(), purpose: 'recovery' })
    })
  }

  return (
    <AccountPage title="Reset password">
      {signedIn ? (
        recovering && <NewPassword />
      ) : pending ? (
        <EnterCode pending={pending} focus={justAsked} onLeave={() => awaitCode(null)} />
      ) : (
        <form onSubmit={submit} noValidate className="space-y-3">
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
          <Outcome problem={problem} />
          <Button type="submit" disabled={busy !== null} className="w-full">
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            Email me a code
          </Button>
        </form>
      )}
    </AccountPage>
  )
}
