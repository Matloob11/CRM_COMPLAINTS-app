import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import type { Priority, Status } from '@/api/types'
import { priorityStyle, statusStyle } from '@/lib/status'
import { initials } from '@/lib/format'
import { IconAlert, IconRetry } from './Icons'

/* ------------------------------------------------------------------ Avatar */

/**
 * Tints are luminous hues on a dark ground, not pastel fills. A pale chip that
 * reads well on white becomes the brightest thing on the screen here and pulls
 * the eye away from the conversation.
 */
const AVATAR_TINTS = [
  ['rgba(111, 168, 255, 0.20)', '#BBD5FF'],
  ['rgba(79, 214, 156, 0.20)', '#A9EDCC'],
  ['rgba(240, 180, 92, 0.20)', '#FBDCA9'],
  ['rgba(178, 148, 255, 0.20)', '#D6C8FF'],
  ['rgba(255, 128, 120, 0.20)', '#FFC0BB'],
  ['rgba(53, 189, 166, 0.20)', '#9BE7D8'],
] as const

export function Avatar({
  name,
  url,
  size = 32,
  className,
}: {
  name: string
  url?: string | null
  size?: number
  className?: string
}) {
  const tintIndex = Math.abs(hash(name)) % AVATAR_TINTS.length
  const tint = AVATAR_TINTS[tintIndex] as readonly [string, string]

  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className={clsx('shrink-0 rounded-full object-cover ring-1 ring-white/15', className)}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={clsx(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-1 ring-white/10',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: tint[0],
        color: tint[1],
        fontSize: Math.max(10, Math.round(size * 0.38)),
      }}
    >
      {initials(name)}
    </span>
  )
}

function hash(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0
  return h
}

/* ------------------------------------------------------------------ Button */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

/**
 * Exactly one solid button in the palette. On glass, every filled surface
 * competes with the panel behind it, so anything that is not the single
 * primary action is a tinted pane instead of a block of colour.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-400/90 text-[#04201c] hover:bg-brand-300 active:bg-brand-300 disabled:bg-white/[0.08] disabled:text-ink-400',
  secondary:
    'glass-inset text-ink-700 hover:bg-white/[0.10] hover:text-ink-900 active:bg-white/[0.14] disabled:text-ink-300',
  ghost: 'text-ink-500 hover:bg-white/[0.08] hover:text-ink-800 active:bg-white/[0.12] disabled:text-ink-300',
  danger: 'bg-status-rejected/90 text-[#2a0a08] hover:bg-status-rejected active:brightness-95',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-[0.7rem] font-medium transition-colors duration-150',
        'disabled:cursor-not-allowed',
        size === 'sm' ? 'h-8 px-2.5 text-sm' : 'h-9 px-3.5 text-base',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex h-9 w-9 items-center justify-center rounded-[0.7rem] text-ink-400 transition-colors',
        'hover:bg-white/[0.09] hover:text-ink-800 active:bg-white/[0.13] disabled:cursor-not-allowed disabled:text-ink-300',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ Status */

/**
 * Status is never colour-only: the dot carries a glyph and every colour surface
 * is paired with its label, so the state survives colour blindness.
 */
export function StatusDot({ status, size = 8 }: { status: Status; size?: number }) {
  const style = statusStyle(status)
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: style.solid,
        // A small light rather than a flat disc, so it belongs to the glass.
        boxShadow: `0 0 ${size}px ${style.solid}80`,
      }}
      role="img"
      aria-label={style.label}
    />
  )
}

/**
 * The signature element.
 *
 * The pill is a piece of the same glass as the panel it sits on, lit from
 * inside by the status colour, rather than an opaque chip laid on top. It is
 * the one place the material itself carries the meaning — which is why
 * everything around it is kept quiet.
 */
export function StatusPill({
  status,
  size = 'md',
  className,
}: {
  status: Status
  size?: 'sm' | 'md'
  className?: string
}) {
  const style = statusStyle(status)
  return (
    <span
      className={clsx(
        'relative inline-flex shrink-0 items-center gap-1.5 overflow-hidden rounded-full font-medium',
        size === 'sm' ? 'h-5 px-2 text-2xs' : 'h-6 px-2.5 text-xs',
        className,
      )}
      style={{
        background: style.soft,
        color: style.ink,
        boxShadow: `inset 0 0 0 1px ${style.border}, inset 0 8px 12px -8px ${style.solid}`,
      }}
    >
      <span aria-hidden="true" className="text-[9px] leading-none" style={{ color: style.solid }}>
        {style.glyph}
      </span>
      {style.label}
    </span>
  )
}

/** Four stacked bars; height encodes urgency so it is not colour-only either. */
export function PriorityIndicator({ priority }: { priority: Priority }) {
  const style = priorityStyle(priority)
  return (
    <span
      className="inline-flex items-end gap-[2px]"
      role="img"
      aria-label={`Priority: ${style.label}`}
      title={`Priority: ${style.label}`}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full"
          style={{
            height: 4 + i * 2.5,
            background: i < style.level ? style.ink : 'rgba(255, 255, 255, 0.16)',
          }}
        />
      ))}
    </span>
  )
}

export function PriorityTag({ priority }: { priority: Priority }) {
  const style = priorityStyle(priority)
  return (
    <span
      className="inline-flex h-5 items-center gap-1.5 rounded px-1.5 text-2xs font-medium"
      style={{ background: style.soft, color: style.ink }}
    >
      <PriorityIndicator priority={priority} />
      {style.label}
    </span>
  )
}

/* --------------------------------------------------------------- Skeletons */

export function Skeleton({ className }: { className?: string }) {
  return <span className={clsx('skeleton block', className)} />
}

/* ------------------------------------------------------- Empty / error UI */

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: ReactNode
  title: string
  body: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center px-8 py-12 text-center animate-fade-in',
        className,
      )}
    >
      <span className="glass mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-brand-300">
        {icon}
      </span>
      <h3 className="text-lg font-semibold tracking-tight text-ink-800">{title}</h3>
      <p className="mt-1.5 max-w-[42ch] text-base leading-relaxed text-ink-500">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  body,
  onRetry,
  className,
}: {
  title?: string
  body: string
  onRetry: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={clsx('flex flex-col items-center justify-center px-8 py-12 text-center', className)}
    >
      <span
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-status-rejected-ink"
        style={{
          background: 'rgba(255, 128, 120, 0.14)',
          boxShadow: 'inset 0 0 0 1px rgba(255, 128, 120, 0.34)',
        }}
      >
        <IconAlert size={24} />
      </span>
      <h3 className="text-lg font-semibold tracking-tight text-ink-800">{title}</h3>
      <p className="mt-1.5 max-w-[46ch] text-base leading-relaxed text-ink-500">{body}</p>
      <Button variant="secondary" className="mt-5" onClick={onRetry}>
        <IconRetry size={16} />
        Try again
      </Button>
    </div>
  )
}

/* -------------------------------------------------------------- Misc atoms */

export function Divider({ className }: { className?: string }) {
  return <hr className={clsx('border-0 border-t border-ink-100', className)} />
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-2xs font-semibold uppercase tracking-[0.1em] text-ink-400">{children}</span>
  )
}
