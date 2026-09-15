import { memo } from 'react'
import clsx from 'clsx'
import type { ComplaintSummary } from '@/api/types'
import { formatRelative } from '@/lib/format'
import { statusStyle } from '@/lib/status'
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  PriorityIndicator,
  Skeleton,
  StatusDot,
} from '@/components/primitives'
import { IconInbox, IconPlus, IconSearch } from '@/components/Icons'

/**
 * The complaint list. Three designed states, not one plus two afterthoughts:
 * skeletons that match the real row geometry, an empty state that tells a new
 * agent what to do next, and an error state with a retry.
 */
export function ComplaintList({
  rows,
  loading,
  error,
  onRetry,
  selectedId,
  onSelect,
  isAdmin,
  filtered,
  onClearFilters,
  onNew,
}: {
  rows: ComplaintSummary[]
  loading: boolean
  error: unknown
  onRetry: () => void
  selectedId: number | null
  onSelect: (id: number) => void
  isAdmin: boolean
  filtered: boolean
  onClearFilters: () => void
  onNew: () => void
}) {
  if (error) {
    return (
      <ErrorState
        title="Could not load complaints"
        body="The server did not answer. Your work is safe — nothing was lost."
        onRetry={onRetry}
      />
    )
  }

  if (loading && rows.length === 0) {
    return (
      <ul className="space-y-px p-2" aria-busy="true" aria-label="Loading complaints">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="rounded-card bg-surface px-3 py-3">
            <div className="flex items-start gap-3">
              <Skeleton className="mt-0.5 h-2 w-2 rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton className={clsx('h-3.5', i % 3 === 0 ? 'w-3/5' : 'w-4/5')} />
                <Skeleton className="mt-2 h-3 w-11/12" />
                <Skeleton className="mt-2 h-2.5 w-24" />
              </div>
              <Skeleton className="h-2.5 w-8" />
            </div>
          </li>
        ))}
      </ul>
    )
  }

  if (rows.length === 0) {
    return filtered ? (
      <EmptyState
        icon={<IconSearch size={24} />}
        title="No complaints match these filters"
        body="Try a different status, or clear the filters to see everything again."
        action={
          <Button variant="secondary" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<IconInbox size={24} />}
        title={isAdmin ? 'No complaints have been raised yet' : 'You have not raised a complaint yet'}
        body={
          isAdmin
            ? 'When someone in the portal raises a complaint it will appear here, newest activity first.'
            : 'Raise one and it lands with the admin team straight away. You can attach photos, video or documents, and follow the whole conversation here.'
        }
        action={
          <Button variant="primary" onClick={onNew}>
            <IconPlus size={16} />
            New complaint
          </Button>
        }
      />
    )
  }

  return (
    <ul className="space-y-px p-2" aria-label="Complaints">
      {rows.map((row) => (
        <Row
          key={row.id}
          row={row}
          selected={row.id === selectedId}
          onSelect={onSelect}
          isAdmin={isAdmin}
        />
      ))}
    </ul>
  )
}

const Row = memo(function Row({
  row,
  selected,
  onSelect,
  isAdmin,
}: {
  row: ComplaintSummary
  selected: boolean
  onSelect: (id: number) => void
  isAdmin: boolean
}) {
  const style = statusStyle(row.status)

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(row.id)}
        aria-current={selected ? 'true' : undefined}
        className={clsx(
          'group relative w-full rounded-card px-3 py-2.5 text-left transition-colors duration-150',
          selected
            ? 'bg-white/[0.13] shadow-card ring-1 ring-inset ring-white/15'
            : 'hover:bg-white/[0.06]',
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            'absolute inset-y-2 left-0 w-[3px] rounded-full transition-opacity',
            selected ? 'opacity-100' : 'opacity-0',
          )}
          style={{ background: style.solid }}
        />

        <div className="flex items-start gap-2.5">
          <span className="mt-[7px]">
            <StatusDot status={row.status} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h3
                className={clsx(
                  'min-w-0 flex-1 truncate text-base leading-snug',
                  row.unread_count > 0 ? 'font-semibold text-ink-900' : 'font-medium text-ink-800',
                )}
              >
                {row.subject}
              </h3>
              <time
                dateTime={row.last_message_at}
                className="shrink-0 text-2xs tabular-nums text-ink-500"
              >
                {formatRelative(row.last_message_at)}
              </time>
            </div>

            <p className="mt-0.5 truncate text-sm text-ink-500">
              {row.last_message_preview ?? 'No messages yet'}
            </p>

            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-2xs font-medium" style={{ color: style.ink }}>
                {style.label}
              </span>
              <PriorityIndicator priority={row.priority} />

              {isAdmin ? (
                <span className="ml-auto flex min-w-0 items-center gap-1.5">
                  <Avatar name={row.author.name} url={row.author.avatar_url} size={18} />
                  <span className="truncate text-2xs text-ink-500">{row.author.name}</span>
                </span>
              ) : null}

              {row.unread_count > 0 ? (
                <span
                  className={clsx(
                    'figure ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-300 px-1.5 text-2xs font-semibold text-[#04201c]',
                    isAdmin && 'ml-1.5',
                  )}
                >
                  <span className="sr-only">Unread messages: </span>
                  {row.unread_count}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </button>
    </li>
  )
})
