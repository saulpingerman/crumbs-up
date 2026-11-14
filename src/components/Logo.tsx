import { cn } from '@/lib/cn'

/** The bitten cookie. Decorative: pair it with visible text. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}logo.svg`}
      alt=""
      aria-hidden
      draggable={false}
      className={cn('size-8 select-none', className)}
    />
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="font-display text-[22px] leading-none font-semibold text-ink">
        Crumbs Up
      </span>
    </span>
  )
}
