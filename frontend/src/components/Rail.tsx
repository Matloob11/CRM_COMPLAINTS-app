import clsx from 'clsx'
import type { ReactNode } from 'react'
import type { RealtimeState } from '@/hooks/useRealtime'
import { IconGauge, IconInbox, IconSliders } from './Icons'

export type View = 'dashboard' | 'complaints'

/**
 * The rail exists to get everything that is not the current conversation off
 * the screen. Two destinations, one admin tool, and a connection light — each
 * one an icon with a tooltip and an accessible name, so the widest thing
 * competing with the thread is 56px.
 */
export function Rail({
  view,
  onView,
  onOpenFilters,
  filtersActive,
  isAdmin,
  realtime,
  unread,
}: {
  view: View
  onView: (view: View) => void
  onOpenFilters: () => void
  filtersActive: boolean
  isAdmin: boolean
  realtime: RealtimeState
  unread: number
}) {
  return (
    <nav
      aria-label="Sections"
      className="glass flex w-14 shrink-0 flex-col items-center gap-1.5 rounded-pane py-3"
    >
      <RailButton
        label="Dashboard"
        active={view === 'dashboard'}
        onClick={() => onView('dashboard')}
        icon={<IconGauge size={19} />}
      />
      <RailButton
        label="Complaints"
        active={view === 'complaints'}
        onClick={() => onView('complaints')}
        icon={<IconInbox size={19} />}
        badge={unread}
      />

      {isAdmin ? (
        <>
          <span aria-hidden="true" className="my-1 h-px w-6 bg-ink-100" />
          <RailButton
            label="Filters"
            active={filtersActive}
            onClick={onOpenFilters}
            icon={<IconSliders size={19} />}
            dot={filtersActive}
          />
        </>
      ) : null}

      <div className="mt-auto pt-2">
        <ConnectionLight state={realtime} />
      </div>
    </nav>
  )
}

function RailButton({
  label,
  icon,
  active,
  onClick,
  badge,
  dot,
}: {
  label: string
  icon: ReactNode
  active: boolean
  onClick: () => void
  badge?: number
  dot?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'relative flex h-10 w-10 items-center justify-center rounded-[0.85rem] transition-all duration-200',
        active
          ? 'bg-white/[0.14] text-ink-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)]'
          : 'text-ink-400 hover:bg-white/[0.07] hover:text-ink-700',
      )}
    >
      {icon}

      {/* The active marker is a lit edge on the rail itself rather than a pill
          behind the icon, so switching views moves one small light. */}
      {active ? (
        <span
          aria-hidden="true"
          className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand-300"
          style={{ boxShadow: '0 0 10px 1px rgba(95, 211, 190, 0.7)' }}
        />
      ) : null}

      {badge ? (
        <span className="figure absolute -right-0.5 -top-0.5 min-w-[17px] rounded-full bg-status-open px-1 text-[10px] font-bold leading-[17px] text-[#08122a]">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}

      {dot && !badge ? (
        <span
          aria-hidden="true"
          className="absolute -right-0 -top-0 h-2 w-2 rounded-full bg-brand-300 ring-2 ring-[#0d1730]"
        />
      ) : null}
    </button>
  )
}

const CONNECTION_COPY: Record<RealtimeState, { label: string; title: string; tone: string }> = {
  live: {
    label: 'Live',
    title: 'Live updates are connected.',
    tone: 'bg-status-resolved',
  },
  connecting: {
    label: 'Connecting',
    title: 'Opening the live update stream.',
    tone: 'bg-status-progress animate-pulse-soft',
  },
  reconnecting: {
    label: 'Reconnecting',
    title: 'The live stream dropped. Reconnecting; the list still refreshes on a timer.',
    tone: 'bg-status-progress animate-pulse-soft',
  },
  polling: {
    label: 'Live updates paused',
    title: 'Live updates are unavailable, so everything refreshes every 10 seconds instead. Nothing is lost.',
    tone: 'bg-ink-300',
  },
}

/**
 * A dropped stream degrades to polling and costs the user nothing, so it gets a
 * 6px light and a tooltip rather than a chip or a banner. It must never read as
 * an incident.
 */
function ConnectionLight({ state }: { state: RealtimeState }) {
  const copy = CONNECTION_COPY[state]
  return (
    <span
      role="status"
      title={copy.title}
      className="flex h-8 w-8 items-center justify-center rounded-full"
    >
      <span className="sr-only">{copy.label}</span>
      <span aria-hidden="true" className={clsx('h-1.5 w-1.5 rounded-full', copy.tone)} />
    </span>
  )
}
