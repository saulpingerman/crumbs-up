import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[transform,background-color,box-shadow,opacity] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45'

const variants: Record<Variant, string> = {
  primary: 'bg-cocoa text-on-cocoa shadow-card hover:opacity-90',
  secondary: 'border border-line bg-paper text-ink hover:bg-oat',
  soft: 'bg-oat text-ink hover:brightness-95 dark:hover:brightness-110',
  ghost: 'text-ink-soft hover:bg-oat hover:text-ink',
  danger: 'bg-danger-soft text-danger hover:brightness-95 dark:hover:brightness-125',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-14 px-7 text-base',
}

function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className)
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({ variant, size, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />
}

interface ButtonLinkProps extends LinkProps {
  variant?: Variant
  size?: Size
}

export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
  tone?: 'plain' | 'glass'
}

/** Round, icon-only button. `label` is what screen readers announce. */
export function IconButton({
  label,
  children,
  tone = 'plain',
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-40',
        tone === 'plain' && 'text-ink-soft hover:bg-oat hover:text-ink',
        tone === 'glass' && 'bg-black/45 text-white backdrop-blur-md hover:bg-black/60',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
