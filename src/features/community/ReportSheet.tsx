import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import { sendFeedback } from '@/lib/cloud/feedback'
import { hide, type Hidden } from '@/lib/hidden-top'

export interface Reportable {
  /** What is being reported, as it appears in the list. */
  title: string
  detail: string
  /** What hiding it takes out of this person's list. */
  hidden: Hidden
}

/**
 * Report an entry in Top rated (its names were typed by someone), or just
 * hide it. Either way it leaves this person's list straight away; a report
 * also reaches the owner, who can take it out for everyone.
 */
export function ReportSheet({ entry, onClose }: { entry: Reportable | null; onClose: () => void }) {
  const [sending, setSending] = useState(false)

  async function report(entry: Reportable) {
    setSending(true)
    hide(entry.hidden)
    try {
      await sendFeedback({
        kind: 'other',
        message: `Reported in Top rated: ${entry.title} · ${entry.detail} (${entry.hidden.kind})`,
        contact: '',
        screen: '/top',
      })
      toast('Reported and hidden')
    } catch {
      toast('Hidden', { description: 'The report couldn’t be sent just now.' })
    } finally {
      setSending(false)
      onClose()
    }
  }

  return (
    <Sheet
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open && !sending) onClose()
      }}
      title="Report this?"
    >
      {entry && (
        <div className="space-y-4 px-5 pb-6">
          <p className="rounded-2xl bg-oat px-4 py-3 [overflow-wrap:anywhere]">
            <span className="font-semibold">{entry.title}</span>
            {entry.detail && <span className="block text-sm text-ink-soft">{entry.detail}</span>}
          </p>
          <p className="text-sm text-ink-soft">
            It comes off your list now. A report is sent to us to look at, and anything offensive is
            taken off for everyone.
          </p>
          <div className="grid gap-2">
            <Button variant="danger" disabled={sending} onClick={() => void report(entry)}>
              {sending && <LoaderCircle className="size-4 animate-spin" />}
              Report and hide
            </Button>
            <Button
              variant="secondary"
              disabled={sending}
              onClick={() => {
                hide(entry.hidden)
                toast('Hidden')
                onClose()
              }}
            >
              Just hide it
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
