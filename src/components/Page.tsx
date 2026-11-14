import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { useTitle } from '@/lib/use-title'

interface PageProps {
  title: string
  kicker?: string
  lede?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}

/** Standard page frame: a display headline and a centered column. */
export function Page({ title, kicker, lede, action, children, className }: PageProps) {
  useTitle(title)
  return (
    <div className={cn('mx-auto w-full max-w-5xl px-4 pt-5 pb-10 sm:px-6 md:pt-10', className)}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 md:mb-8">
        <div className="min-w-0">
          {kicker && (
            <p className="mb-1 text-xs font-bold tracking-[0.14em] text-crust uppercase">
              {kicker}
            </p>
          )}
          <h1 className="font-display text-[34px] leading-[1.05] font-semibold md:text-5xl">
            {title}
          </h1>
          {lede && <p className="mt-2 max-w-xl text-[15px] text-ink-soft">{lede}</p>}
        </div>
        {action}
      </header>
      {children}
    </div>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cn('min-w-0 rounded-3xl border border-line bg-paper p-5 shadow-card', className)}
    >
      {children}
    </section>
  )
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn('font-display text-xl leading-tight font-semibold', className)}>
      {children}
    </h2>
  )
}

interface EmptyProps {
  title: string
  children: ReactNode
  action?: ReactNode
  art?: ReactNode
}

export function Empty({ title, children, action, art }: EmptyProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-12 text-center">
      {art}
      <h2 className="mt-5 font-display text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{children}</p>
      {action && <div className="mt-6 flex flex-col items-center gap-3">{action}</div>}
    </div>
  )
}
