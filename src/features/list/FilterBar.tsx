import clsx from 'clsx'
import { STATUSES, type ComplaintFilters, type Status } from '@/api/types'
import { statusStyle } from '@/lib/status'
import { IconSearch, IconClose } from '@/components/Icons'

/**
 * Search, and one row of status chips. That is the whole bar.
 *
 * The previous build also carried a stat strip above it and two admin selects
 * below it, which put four competing control groups on top of the list before a
 * single complaint was visible. The counts now live on the dashboard and the
 * admin selects live in the filters panel, both a click away on the rail. What
 * remains is what a person uses on nearly every visit.
 */
export function FilterBar({
  filters,
  counts,
  onChange,
  isAdmin,
}: {
  filters: ComplaintFilters
  counts: Record<Status, number> | undefined
  onChange: (next: Partial<ComplaintFilters>) => void
  isAdmin: boolean
}) {
  return (
    <div className="sticky top-0 z-20 px-3 pb-2.5 pt-3">
      <div className="relative">
        <IconSearch
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
        />
        <input
          type="search"
          value={filters.q}
          onChange={(e) => onChange({ q: e.target.value })}
          placeholder={isAdmin ? 'Search subject, ticket or author' : 'Search your complaints'}
          aria-label="Search complaints"
          className={clsx(
            'glass-inset h-9 w-full rounded-[0.7rem] border-0 pl-9 pr-8 text-base text-ink-800',
            'placeholder:text-ink-400 focus:bg-white/[0.09]',
            '[&::-webkit-search-cancel-button]:appearance-none',
          )}
        />
        {filters.q ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange({ q: '' })}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-ink-400 hover:bg-white/10 hover:text-ink-700"
          >
            <IconClose size={14} />
          </button>
        ) : null}
      </div>

      <div
        role="group"
        aria-label="Filter by status"
        className="mt-2 flex flex-wrap items-center gap-1.5"
      >
        <Chip
          label="All"
          selected={filters.status === 'all'}
          onClick={() => onChange({ status: 'all' })}
        />
        {STATUSES.map((status) => {
          const style = statusStyle(status)
          return (
            <Chip
              key={status}
              label={style.label}
              glyph={style.glyph}
              accent={style.solid}
              soft={style.soft}
              ink={style.ink}
              border={style.border}
              count={counts?.[status]}
              selected={filters.status === status}
              onClick={() => onChange({ status })}
            />
          )
        })}
      </div>
    </div>
  )
}

function Chip({
  label,
  count,
  selected,
  onClick,
  accent,
  soft,
  ink,
  border,
  glyph,
}: {
  label: string
  count?: number
  selected: boolean
  onClick: () => void
  accent?: string
  soft?: string
  ink?: string
  border?: string
  glyph?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all duration-150',
        !selected && 'glass-inset text-ink-500 hover:bg-white/[0.09] hover:text-ink-800',
      )}
      style={
        selected
          ? {
              background: soft ?? 'rgba(255, 255, 255, 0.14)',
              color: ink ?? '#F6F9FF',
              boxShadow: `inset 0 0 0 1px ${border ?? 'rgba(255,255,255,0.3)'}`,
            }
          : undefined
      }
    >
      {glyph ? (
        <span aria-hidden="true" style={{ color: accent }} className="text-[9px] leading-none">
          {glyph}
        </span>
      ) : null}
      {label}
      {count !== undefined && count > 0 ? (
        <span
          className={clsx(
            'figure ml-0.5 rounded-full px-1.5 text-2xs font-semibold',
            selected ? 'bg-black/25' : 'bg-white/10 text-ink-400',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  )
}
