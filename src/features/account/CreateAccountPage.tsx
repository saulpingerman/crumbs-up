import { LoaderCircle } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/Button'
import { Field, TextInput } from '@/components/Field'
import { readPending, rememberPending, type PendingCode } from '@/lib/cloud/pending-code'
import { signUp, useSession } from '@/lib/cloud/session'
import { EnterCode } from './EnterCode'
import { AccountPage, Outcome } from './form'
import { useAttempt } from './use-attempt'
import { looksLikeEmail, passwordProblem } from './passwords'

/** What the sign-in form hands over when it sends someone here. */
export interface AccountPageState {
  /** The address already typed, so it needn't be typed again. */
  email?: string
  /** A code was sent on the way here; go straight to asking for it. */
  asked?: boolean
}

export function CreateAccountPage() {
  const id = useId()
  const session = useSession()
  const navigate = useNavigate()
  const arrived = useLocation().state as AccountPageState | null
  const [email, setEmail] = useState(arrived?.email ?? '')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  // Read once on arrival: someone back from their email finds the code step
  // waiting, even if the phone threw the page away while they were gone.
  const [pending, setPending] = useState<PendingCode | null>(() => {
    const waiting = readPending()
    return waiting?.purpose === 'signup' ? waiting : null
  })
  // Asked for just now, as opposed to found waiting: only then does the
  // field take the keyboard.
  const [justAsked, setJustAsked] = useState(Boolean(arrived?.asked))
  const { busy, problem, setProblem, attempt } = useAttempt<'create'>()

  const signedIn = session.status === 'signed-in'
  useEffect(() => {
    if (!signedIn) return
    rememberPending(null)
    void navigate('/settings', { replace: true })
  }, [signedIn, navigate])

  if (session.status === 'off') return <Navigate to="/settings" replace />

  function awaitCode(next: PendingCode | null) {
    rememberPending(next)
    setPending(next)
    setJustAsked(next !== null)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!looksLikeEmail(email)) return setProblem('Enter your email address.')
    const wrong = passwordProblem(password, again)
    if (wrong) return setProblem(wrong)
    void attempt('create', async () => {
      if ((await signUp(email.trim(), password)) === 'confirm')
        awaitCode({ email: email.trim(), purpose: 'signup' })
    })
  }

  return (
    <AccountPage title="Create account">
      {pending ? (
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
          <Field label="Password" htmlFor={`${id}-password`}>
            <TextInput
              id={`${id}-password`}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm password" htmlFor={`${id}-again`}>
            <TextInput
              id={`${id}-again`}
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
            />
          </Field>
          <Outcome problem={problem} />
          <Button type="submit" disabled={busy !== null} className="w-full">
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            Create account
          </Button>
        </form>
      )}
    </AccountPage>
  )
}
