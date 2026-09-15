import clsx from 'clsx'
import { STATUSES, type ComplaintSummary, type StatsResponse, type Status } from '@/api/types'
import { statusStyle } from '@/lib/status'
import { formatRelative } from '@/lib/format'
import { Avatar, Skeleton, StatusPill } from '@/components/primitives'
import { IconPlus } from '@/components/Icons'

/**
 * Requirement 7, given a room of its own.
 *
 * The old build carried this as a six-tile strip stapled above the complaint
 * list, which meant the two most important surfaces in the app were fighting
 * for the same 400px column. Moving it here lets the list be a list and lets
 * the numbers be legible.
 *
 * Scoped by the backend: an agent sees their own totals, an admin sees the
 * portal's. Every tile is a filter, so the number you are looking at is one
 * click from the complaints that produced it.
 */
export function Dashboard({
  stats,
  loading,
  recent,
  isAdmin,
  userName,
  onPick,
  onOpen,
  onNew,
  wide,
}: {
  stats: StatsResponse | undefined
  loading: boolean
  recent: ComplaintSummary[]
  isAdmin: boolean
  userName: string
  onPick: (status: Status | 'all') => void
  onOpen: (id: number) => void
  onNew: () => void
  wide: boolean
}) {
  const total = stats?.total ?? 0
  const counts = stats?.by_status

  // Open + in progress + on hold. The number a person actually acts on, as
  // opposed to the lifetime total, which only ever grows.
  const live =
    (counts?.open ?? 0) + (counts?.in_progress ?? 0) + (counts?.on_hold ?? 0)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
      <header className="mb-6">
        <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-400">
          {isAdmin ? 'All complaints' : 'Your complaints'}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink-900">
          {greeting()}, {firstName(userName)}
        </h1>
      </header>

      {/* The headline is what is still open, not the lifetime count: one number
          you can act on, with the total kept as context beside it. */}
      <section className="glass mb-4 rounded-pane p-6">
        {loading && !stats ? (
          <Skeleton className="h-16 w-48 rounded-card" />
        ) : (
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-400">
                Still open
              </p>
              <p className="figure mt-1 font-display text-4xl font-semibold text-ink-900">{live}</p>
            </div>
            <div className="pb-1.5">
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-400">
                Raised in total
              </p>
              <p className="figure mt-1 font-display text-2xl font-medium text-ink-600">{total}</p>
            </div>

            <button
              type="button"
              onClick={onNew}
              className="ml-auto inline-flex h-10 items-center gap-2 rounded-[0.85rem] bg-brand-400/90 px-4 text-base font-medium text-[#04201c] transition-colors hover:bg-brand-300"
            >
              <IconPlus size={16} />
              New complaint
            </button>
          </div>
        )}
      </section>

      {/* One tile per status, in workflow order. */}
      <section
        aria-label="Complaints by status"
        className={clsx('mb-4 grid gap-3', wide ? 'grid-cols-5' : 'grid-cols-2')}
      >
        {STATUSES.map((status) => (
          <StatusTile
            key={status}
            status={status}
            count={counts?.[status]}
            loading={loading && !stats}
            onClick={() => onPick(status)}
          />
        ))}
      </section>

      <section className="glass rounded-pane p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-ink-800">Latest activity</h2>
          <button
            type="button"
            onClick={() => onPick('all')}
            className="text-xs font-medium text-brand-300 hover:text-brand-200"
          >
            See all
          </button>
        </div>

        {loading && recent.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-card" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="py-8 text-center text-base text-ink-500">
            Nothing yet. Raise a complaint and it will appear here as a conversation.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {recent.slice(0, 6).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onOpen(row.id)}
                  className="glass-inset flex w-full items-center gap-3 rounded-card px-3 py-2.5 text-left transition-colors hover:bg-white/[0.08]"
                >
                  {isAdmin ? <Avatar name={row.author.name} url={row.author.avatar_url} size={30} /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium text-ink-800">
                      {row.subject}
                    </span>
                    <span className="figure block truncate text-xs text-ink-400">
                      {row.ticket_no}
                      {isAdmin ? ` · ${row.author.name}` : ''} · {formatRelative(row.last_message_at)}
                    </span>
                  </span>
                  <StatusPill status={row.status} size="sm" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function StatusTile({
  status,
  count,
  loading,
  onClick,
}: {
  status: Status
  count: number | undefined
  loading: boolean
  onClick: () => void
}) {
  const style = statusStyle(status)

  if (loading) return <Skeleton className="h-[86px] rounded-card" />

  return (
    <button
      type="button"
      onClick={onClick}
      className="glass group relative overflow-hidden rounded-card p-4 text-left transition-transform duration-200 hover:-translate-y-0.5"
    >
      {/* The status colour arrives as light inside the glass rather than as a
          block of fill on top of it: the tile is lit from its own corner. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-7 -top-10 h-28 w-28 rounded-full opacity-80 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(circle, ${style.solid}66 0%, transparent 68%)` }}
      />
      <span className="relative flex items-center gap-1.5">
        <span aria-hidden="true" className="text-[9px] leading-none" style={{ color: style.solid }}>
          {style.glyph}
        </span>
        <span className="truncate text-2xs font-semibold uppercase tracking-[0.1em] text-ink-400">
          {style.label}
        </span>
      </span>
      <span className="figure relative mt-2 block font-display text-2xl font-semibold text-ink-900">
        {count ?? 0}
      </span>
    </button>
  )
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Bitrix display names here carry a role prefix -- "Admin Abdul Malik" -- so
 * naive first-token splitting greets the person as "Admin". Skip the prefix and
 * use the name they were actually given.
 */
const NAME_PREFIXES = new Set(['admin', 'mr', 'mrs', 'ms', 'dr', 'eng'])

function firstName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => !NAME_PREFIXES.has(part.toLowerCase().replace(/[.]/g, '')))
  return parts[0] || name.trim().split(/\s+/)[0] || 'there'
}
