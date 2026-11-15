import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Card, Page } from '@/components/Page'

export function Outcome({ problem, notice }: { problem: string | null; notice?: string | null }) {
  return (
    <>
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
    </>
  )
}

/** The frame the account pages share: a title, a way back, one card. */
export function AccountPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Page
      title={title}
      className="max-w-md"
      action={
        <Link
          to="/settings"
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Settings
        </Link>
      }
    >
      <Card>{children}</Card>
    </Page>
  )
}
