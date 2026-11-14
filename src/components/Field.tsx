import { ChevronDown } from 'lucide-react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export const inputClass =
  'h-12 w-full scroll-mt-28 rounded-xl border border-line bg-paper px-3.5 text-ink placeholder:text-ink-faint transition-colors focus:border-crust focus:outline-none focus:ring-2 focus:ring-crust/25 aria-[invalid=true]:border-danger'

interface FieldProps {
  label: string
  htmlFor: string
  optional?: boolean
  error?: string
  children: ReactNode
  className?: string
}

export function Field({ label, htmlFor, optional, error, children, className }: FieldProps) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 flex items-baseline justify-between text-sm font-semibold"
      >
        <span>{label}</span>
        {optional && <span className="text-xs font-medium text-ink-faint">Optional</span>}
      </label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(inputClass, 'appearance-none pr-10', className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ink-soft"
      />
    </div>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  label: string
  className?: string
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-full bg-oat p-1', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 flex-1 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition',
            value === o.value ? 'bg-paper text-ink shadow-card' : 'text-ink-soft hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
