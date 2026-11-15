import { useState } from 'react'
import { AuthError } from '@/lib/cloud/session'

/** Run one thing at a time, and keep what came of it for the form to show. */
export function useAttempt<Kind extends string>() {
  const [busy, setBusy] = useState<Kind | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  async function attempt(kind: Kind, action: () => Promise<string | void>) {
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

  return { busy, notice, problem, setProblem, attempt }
}
