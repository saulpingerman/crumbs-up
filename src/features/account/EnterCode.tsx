import { LoaderCircle } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { Field, TextInput } from '@/components/Field'
import type { PendingCode } from '@/lib/cloud/pending-code'
import { confirmCode, sendCodeAgain } from '@/lib/cloud/session'
import { Outcome } from './form'
import { useAttempt } from './use-attempt'

/** The shortest code the account service sends; projects can ask for longer. */
const SHORTEST_CODE = 6
const LONGEST_CODE = 10

interface EnterCodeProps {
  pending: PendingCode
  /** Give the field the keyboard: the code was asked for just now. */
  focus: boolean
  /** "Use a different email": back to the form this step came from. */
  onLeave: () => void
}

/** The step after "we emailed you a code": typing it in. */
export function EnterCode({ pending, focus, onLeave }: EnterCodeProps) {
  const id = useId()
  const { email, purpose } = pending
  const [code, setCode] = useState('')
  const { busy, notice, problem, setProblem, attempt } = useAttempt<'confirm' | 'again'>()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (code.length < SHORTEST_CODE) return setProblem('Enter the code from the email.')
    // Signing in takes this step off the screen; nothing more to do here.
    void attempt('confirm', () => confirmCode(email, code, purpose))
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <p className="text-sm text-ink-soft">
        {purpose === 'signup' ? (
          <>
            We emailed a code to <strong className="font-semibold text-ink">{email}</strong>. Enter
            it to finish creating your account.
          </>
        ) : (
          <>
            If <strong className="font-semibold text-ink">{email}</strong> has an account, we
            emailed it a code. Enter it to choose a new password.
          </>
        )}
      </p>
      <Field label="Code" htmlFor={`${id}-code`}>
        <TextInput
          id={`${id}-code`}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          autoFocus={focus}
          maxLength={LONGEST_CODE}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="text-center font-display text-2xl font-semibold tracking-[0.3em]"
        />
      </Field>

      <Outcome problem={problem} notice={notice} />

      <Button type="submit" disabled={busy !== null} className="w-full">
        {busy === 'confirm' && <LoaderCircle className="size-4 animate-spin" />}
        {purpose === 'signup' ? 'Confirm' : 'Continue'}
      </Button>
      <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-ink-soft">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            void attempt('again', async () => {
              await sendCodeAgain(email, purpose)
              return 'Sent. The newest code is the one that works.'
            })
          }
          className="underline underline-offset-4 hover:text-ink"
        >
          Send a new code
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={onLeave}
          className="underline underline-offset-4 hover:text-ink"
        >
          Use a different email
        </button>
      </p>
    </form>
  )
}
