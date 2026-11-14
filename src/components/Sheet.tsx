import { X } from 'lucide-react'
import { AlertDialog, Dialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button, IconButton } from './Button'

const overlay =
  'fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-fade data-[state=closed]:opacity-0 transition-opacity'

const panel =
  'fixed z-50 flex max-h-[88dvh] flex-col bg-paper shadow-pop outline-none ' +
  // Phone: a sheet rising from the bottom edge.
  'inset-x-0 bottom-0 rounded-t-3xl pb-safe ' +
  // Larger screens: a centered dialog.
  'sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:pb-0 ' +
  'data-[state=open]:animate-sheet-up data-[state=closed]:animate-sheet-down sm:data-[state=open]:animate-pop sm:data-[state=closed]:animate-none'

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export function Sheet({ open, onOpenChange, title, description, children, className }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlay} />
        <Dialog.Content className={cn(panel, className)} aria-describedby={undefined}>
          <div
            aria-hidden
            className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line sm:hidden"
          />
          <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-2 sm:pt-5">
            <div>
              <Dialog.Title className="font-display text-2xl leading-tight font-semibold">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-sm text-ink-soft">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <IconButton label="Close" className="-mt-1 -mr-2">
                <X className="size-5" />
              </IconButton>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-5">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface ConfirmProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
}

export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
}: ConfirmProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlay} />
        <AlertDialog.Content
          className={cn(panel, 'p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6')}
        >
          <AlertDialog.Title className="font-display text-2xl leading-tight font-semibold">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            {description}
          </AlertDialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
