import * as DialogPrimitive from '@radix-ui/react-dialog'
import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

/* ---------------------------------------------------------------- page chrome */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        {eyebrow ? <p className="t-label text-brass">{eyebrow}</p> : null}
        <h1 className="t-headline mt-2 text-cream">{title}</h1>
        {description ? (
          <p className="t-body mt-2 max-w-[68ch] text-cream-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function SectionTitle({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="t-title text-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/* ------------------------------------------------------------------- surfaces */

export function PaperPanel({
  children,
  className,
  padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section
      className={clsx(
        'paper rounded-card border border-paper-dim',
        padded && 'p-5 sm:p-6',
        className,
      )}
    >
      {children}
    </section>
  )
}

export const Panel = PaperPanel

export function StatTile({
  label,
  value,
  unit,
  hint,
  to,
  tone = 'default',
}: {
  label: string
  value: string
  unit?: string
  hint?: string
  to?: string
  tone?: 'default' | 'danger' | 'ok'
}) {
  const body = (
    <>
      <p className="t-label text-ink-muted">{label}</p>
      <p
        className={clsx(
          't-numeral mt-3',
          tone === 'danger' ? 'text-rust' : tone === 'ok' ? 'text-moss' : 'text-ink',
        )}
      >
        {value}
        {unit ? <span className="ml-1.5 text-sm font-medium text-ink-muted">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-2 text-sm leading-relaxed text-ink-muted">{hint}</p> : null}
    </>
  )

  if (to) {
    return (
      <Link
        to={to}
        className="paper block rounded-card border border-paper-dim p-5 transition-colors hover:border-brass-deep sm:p-6"
      >
        {body}
      </Link>
    )
  }

  return <div className="paper rounded-card border border-paper-dim p-5 sm:p-6">{body}</div>
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-card border border-dashed border-paper-dim bg-paper p-8 text-center">
      <p className="t-title text-ink">{title}</p>
      <p className="t-body mx-auto mt-2 max-w-prose text-ink-muted">{description}</p>
      {action ? <div className="mt-5 flex justify-center gap-2">{action}</div> : null}
    </div>
  )
}

export function LoadingBlock({ label = 'กำลังโหลดข้อมูล…' }: { label?: string }) {
  return (
    <div className="paper rounded-card border border-paper-dim p-8 text-center">
      <p role="status" className="t-body text-ink-muted">
        {label}
      </p>
    </div>
  )
}

export function ErrorBlock({
  error,
  onRetry,
}: {
  error: unknown
  onRetry?: () => void
}) {
  return (
    <div className="paper rounded-card border border-rust/40 p-6">
      <p className="t-title text-ink">โหลดข้อมูลไม่สำเร็จ</p>
      <p role="alert" className="t-body mt-2 text-rust">
        {error instanceof Error ? error.message : 'กรุณาลองใหม่'}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="pill mt-5 border border-paper-dim text-ink"
        >
          ลองอีกครั้ง
        </button>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------------- signals */

const chipTones = {
  ok: 'border-moss/40 bg-moss/10 text-moss',
  warn: 'border-brass/60 bg-brass/20 text-brass-deep',
  danger: 'border-rust/40 bg-rust/10 text-rust',
  neutral: 'border-[#d5cbb3] bg-paper-dim text-ink-muted',
} as const

export function StatusChip({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof chipTones
  children: ReactNode
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium leading-none',
        chipTones[tone],
      )}
    >
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------------- tables */

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-paper-dim bg-paper">
      <table className="table-ledger">{children}</table>
    </div>
  )
}

export function TableHeadCell({
  children,
  className,
  numeric,
}: {
  children: ReactNode
  className?: string
  numeric?: boolean
}) {
  return <th className={clsx(className, numeric && 'text-right')}>{children}</th>
}

export function TableCell({
  children,
  className,
  numeric,
  colSpan,
}: {
  children: ReactNode
  className?: string
  numeric?: boolean
  colSpan?: number
}) {
  return (
    <td colSpan={colSpan} className={clsx(className, numeric && 'numeral text-right')}>
      {children}
    </td>
  )
}

/* ----------------------------------------------------------------------- forms */

export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  hint?: string
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="t-label block text-ink">
        {label}
        {required ? <span className="ml-1 text-rust">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-ink-muted">{hint}</p> : null}
    </div>
  )
}

export function FormActions({
  children,
  pending,
  onCancel,
}: {
  children: ReactNode
  pending?: boolean
  onCancel?: () => void
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-paper-dim pt-5">
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="pill border border-paper-dim text-ink disabled:opacity-60"
        >
          ยกเลิก
        </button>
      ) : null}
      {children}
    </div>
  )
}

export function SubmitButton({
  pending,
  children,
  type = 'submit',
  onClick,
  className,
}: {
  pending?: boolean
  children: ReactNode
  type?: 'submit' | 'button'
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={pending}
      aria-busy={pending || undefined}
      className={clsx('pill bg-brass text-ground hover:bg-[#e2cf9c] disabled:opacity-60', className)}
    >
      {pending ? 'กำลังบันทึก…' : children}
    </button>
  )
}

export function QuietButton({
  children,
  onClick,
  disabled,
  type = 'button',
  className,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'pill min-h-[40px] border border-paper-dim px-4 text-sm text-ink hover:border-brass-deep disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm font-medium text-rust">
      {children}
    </p>
  )
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'ยืนยัน',
  onConfirm,
  pending,
  danger = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void
  pending?: boolean
  danger?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} size="sm">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={pending}
          className="pill border border-paper-dim text-ink disabled:opacity-60"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className={clsx(
            'pill disabled:opacity-60',
            danger ? 'bg-rust text-paper' : 'bg-brass text-ground',
          )}
        >
          {pending ? 'กำลังทำ…' : confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}

/* ---------------------------------------------------------------------- dialog */

const dialogWidths = {
  sm: 'w-[min(92vw,28rem)]',
  md: 'w-[min(92vw,36rem)]',
  lg: 'w-[min(92vw,52rem)]',
} as const

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = 'md',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  size?: keyof typeof dialogWidths
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} className={dialogWidths[size]}>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-xl font-semibold text-ink">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-ink-muted">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded-full border border-[#d6ccb4] px-2.5 py-1 text-sm text-ink-muted hover:border-ink hover:text-ink"
          aria-label="ปิด"
        >
          ✕
        </button>
      </div>
      <div className="mt-5">{children}</div>
    </Modal>
  )
}

export function Modal({
  open,
  onOpenChange,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  className?: string
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[#01120a]/75" />
        <DialogPrimitive.Content
          className={clsx(
            'paper fixed left-1/2 top-1/2 z-50 max-h-[90dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-panel border border-paper-dim p-6 shadow-[0_24px_48px_-12px_rgba(1,29,17,0.45)] sm:p-7',
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">รายการ</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/* -------------------------------------------------------------------- helpers */

export function Divider() {
  return <hr className="border-paper-dim" />
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="t-label text-ink-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  )
}
