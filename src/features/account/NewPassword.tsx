import { LoaderCircle } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/Button'
import { Field, TextInput } from '@/components/Field'
import { setNewPassword } from '@/lib/cloud/session'
import { Outcome } from './form'
import { useAttempt } from './use-attempt'
import { passwordProblem } from './passwords'

/** The last step of a reset: the new password, typed twice. */
export function NewPassword() {
  const id = useId()
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const { busy, problem, setProblem, attempt } = useAttempt<'save'>()

  function submit(event: FormEvent) {
    event.preventDefault()
    const wrong = passwordProblem(password, again)
    if (wrong) return setProblem(wrong)
    void attempt('save', async () => {
      await setNewPassword(password)
      toast.success('Password changed')
    })
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <p className="text-sm text-ink-soft">Choose a new password to finish resetting it.</p>
      <Field label="New password" htmlFor={`${id}-new`}>
        <TextInput
          id={`${id}-new`}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label="Confirm new password" htmlFor={`${id}-again`}>
        <TextInput
          id={`${id}-again`}
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
        />
      </Field>
      <Outcome problem={problem} />
      <Button type="submit" disabled={busy !== null}>
        {busy && <LoaderCircle className="size-4 animate-spin" />}
        Save new password
      </Button>
    </form>
  )
}
