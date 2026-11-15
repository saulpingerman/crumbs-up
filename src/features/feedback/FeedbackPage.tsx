import { ArrowLeft, Bug, Lightbulb, LoaderCircle, MessageSquare } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { Button, ButtonLink } from '@/components/Button'
import { Field, TextInput } from '@/components/Field'
import { Card, Page } from '@/components/Page'
import { cn } from '@/lib/cn'
import {
  feedbackEmailLink,
  sendFeedback,
  type Feedback,
  type FeedbackKind,
} from '@/lib/cloud/feedback'
import { useSession } from '@/lib/cloud/session'

const KINDS: { value: FeedbackKind; label: string; icon: typeof Bug; prompt: string }[] = [
  { value: 'bug', label: 'Bug', icon: Bug, prompt: 'What went wrong? What were you doing?' },
  { value: 'idea', label: 'Idea', icon: Lightbulb, prompt: 'What would make Crumbs Up better?' },
  { value: 'other', label: 'Other', icon: MessageSquare, prompt: 'What’s on your mind?' },
]

/** Tell us about a bug, or suggest something. */
export function FeedbackPage() {
  const id = useId()
  const from = (useLocation().state as { from?: string } | null)?.from ?? ''
  const session = useSession()
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState(session.status === 'signed-in' ? session.email : '')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [problem, setProblem] = useState<string | null>(null)
  const prompt = KINDS.find((k) => k.value === kind)!.prompt
  const feedback: Feedback = { kind, message, contact, screen: from }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!message.trim()) return setProblem('Write a few words first.')
    setProblem(null)
    setState('sending')
    try {
      await sendFeedback(feedback)
      setState('sent')
    } catch {
      setState('failed')
    }
  }

  return (
    <Page
      title="Send feedback"
      className="max-w-md"
      action={
        <Link
          to="/settings"
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Back
        </Link>
      }
    >
      <Card>
        {state === 'sent' ? (
          <div role="status" className="space-y-4 text-center">
            <p className="font-display text-2xl font-semibold">Thanks, got it.</p>
            <p className="text-[15px] text-ink-soft">
              {contact.trim() ? 'We’ll reply if there’s anything to ask.' : 'Every one gets read.'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setMessage('')
                  setState('idle')
                }}
              >
                Send another
              </Button>
              <ButtonLink to="/">Back to the journal</ButtonLink>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
            <div role="radiogroup" aria-label="Kind of feedback" className="grid grid-cols-3 gap-2">
              {KINDS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kind === value}
                  onClick={() => setKind(value)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-2xl border-[1.5px] py-3 text-sm font-semibold transition active:scale-[0.97]',
                    kind === value
                      ? 'border-crust bg-texture-soft text-ink'
                      : 'border-line text-ink-soft hover:border-ink-faint',
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>

            <div>
              <label htmlFor={`${id}-message`} className="mb-1.5 block text-sm font-semibold">
                {prompt}
              </label>
              <textarea
                id={`${id}-message`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={4000}
                className="w-full rounded-xl border border-line bg-paper px-3.5 py-3 text-ink placeholder:text-ink-faint focus:border-crust focus:ring-2 focus:ring-crust/25 focus:outline-none"
              />
            </div>

            <Field label="Your email, for a reply" htmlFor={`${id}-contact`} optional>
              <TextInput
                id={`${id}-contact`}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </Field>

            {problem && (
              <p role="alert" className="text-sm font-medium text-danger">
                {problem}
              </p>
            )}
            {state === 'failed' && (
              <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium">
                Couldn’t send it from here.{' '}
                <a href={feedbackEmailLink(feedback)} className="font-semibold underline">
                  Send it by email instead
                </a>
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={state === 'sending'}>
              {state === 'sending' && <LoaderCircle className="size-4 animate-spin" />}
              Send
            </Button>
          </form>
        )}
      </Card>
    </Page>
  )
}
