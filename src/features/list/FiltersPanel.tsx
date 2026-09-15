import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import type { ApiUser, ComplaintFilters } from '@/api/types'
import { Button } from '@/components/primitives'
import { IconClose } from '@/components/Icons'

/**
 * Admin-only narrowing, kept off the main surface.
 *
 * Assignee and author are used occasionally, by one person, so they do not earn
 * permanent space above every list. They live behind the rail's filters button
 * and slide in over the list pane.
 *
 * These are a convenience only: the backend applies the same filters and
 * enforces the isolation rule regardless of what the client sends.
 */
export function FiltersPanel({
  open,
  filters,
  authors,
  admins,
  onChange,
  onClear,
  onClose,
}: {
  open: boolean
  filters: ComplaintFilters
  authors: ApiUser[]
  admins: ApiUser[]
  onChange: (next: Partial<ComplaintFilters>) => void
  onClear: () => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Read through a ref rather than depending on it: `onClose` is an inline
  // arrow at the call site, so a dependency would re-run this on every parent
  // render and drag focus back to the first control mid-interaction.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    // Focus moves into the panel so a keyboard user is not left behind on the
    // rail button they just pressed.
    panelRef.current?.querySelector<HTMLElement>('select, button')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const narrowed = filters.assigned_to !== 'all' || filters.author !== 'all'

  return (
    <div className="absolute inset-0 z-30 flex animate-fade-in">
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="absolute inset-0 bg-[#04070f]/45"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-label="Filters"
        className="glass-raised relative m-2 flex w-full flex-col rounded-pane p-4 animate-pop-in"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-ink-900">Filters</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-white/10 hover:text-ink-800"
          >
            <IconClose size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <Field
            label="Assignee"
            value={String(filters.assigned_to)}
            onChange={(value) =>
              onChange({
                assigned_to: value === 'all' || value === 'unassigned' ? value : Number(value),
              })
            }
            options={[
              { value: 'all', label: 'Anyone' },
              { value: 'unassigned', label: 'Nobody yet' },
              ...admins.map((admin) => ({ value: String(admin.bitrix_id), label: admin.name })),
            ]}
          />

          <Field
            label="Raised by"
            value={String(filters.author)}
            onChange={(value) => onChange({ author: value === 'all' ? 'all' : Number(value) })}
            options={[
              { value: 'all', label: 'Anyone' },
              ...authors.map((author) => ({ value: String(author.bitrix_id), label: author.name })),
            ]}
          />
        </div>

        <div className="mt-auto flex gap-2 pt-5">
          <Button variant="secondary" className="flex-1" onClick={onClear} disabled={!narrowed}>
            Clear
          </Button>
          <Button variant="primary" className="flex-1" onClick={onClose}>
            Show results
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-[0.1em] text-ink-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={clsx(
          'glass-inset h-9 w-full rounded-[0.7rem] border-0 px-2.5 text-base text-ink-800',
          'focus:bg-white/[0.09]',
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
