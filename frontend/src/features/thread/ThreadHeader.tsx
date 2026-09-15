import { useState } from 'react'
import clsx from 'clsx'
import { STATUSES, type ApiUser, type Complaint, type Status } from '@/api/types'
import { statusStyle } from '@/lib/status'
import { formatFull } from '@/lib/format'
import { Modal } from '@/components/Modal'
import { Avatar, Button, PriorityTag, StatusPill } from '@/components/primitives'
import { IconBack, IconChevronDown } from '@/components/Icons'

/**
 * Thread header. Agents get an unambiguous read-only summary; admins get the two
 * controls they need — change status (which forces a reason) and assign.
 *
 * The admin controls are a convenience only. The backend rejects the same calls
 * from an agent regardless of what the UI renders.
 */
export function ThreadHeader({
  complaint,
  isAdmin,
  admins,
  onBack,
  onChangeStatus,
  onAssign,
  busy,
}: {
  complaint: Complaint
  isAdmin: boolean
  admins: ApiUser[]
  onBack: (() => void) | null
  onChangeStatus: (status: Status, note: string) => Promise<void>
  onAssign: (bitrixId: number | null) => void
  busy: boolean
}) {
  const [statusTarget, setStatusTarget] = useState<Status | null>(null)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const confirm = async () => {
    if (!statusTarget) return
    if (note.trim().length < 3) {
      setNoteError('Give a short reason — it is written into the thread and the audit trail.')
      return
    }
    await onChangeStatus(statusTarget, note.trim())
    setStatusTarget(null)
    setNote('')
    setNoteError(null)
  }

  return (
    <header className="relative z-30 flex items-start gap-3 border-b border-ink-100 bg-surface px-3 py-2.5">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to the complaint list"
          className="-ml-1 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-700"
        >
          <IconBack size={20} />
        </button>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-2xs tracking-tight text-ink-500">{complaint.ticket_no}</span>
          <span className="text-2xs text-ink-200" aria-hidden="true">
            •
          </span>
          <span className="truncate text-2xs text-ink-500">
            Raised {formatFull(complaint.created_at)}
          </span>
        </div>
        <h2 className="mt-0.5 truncate text-lg font-semibold tracking-tight text-ink-900">
          {complaint.subject}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <StatusPill status={complaint.status} size="sm" />
          <PriorityTag priority={complaint.priority} />
          <span className="inline-flex items-center gap-1.5 text-2xs text-ink-500">
            <Avatar name={complaint.author.name} url={complaint.author.avatar_url} size={16} />
            {complaint.author.name}
          </span>
          {complaint.assigned_to && (
            <span className="inline-flex items-center gap-1.5 text-2xs text-ink-500">
              <span className="text-ink-300" aria-hidden="true">
                →
              </span>
              <Avatar name={complaint.assigned_to.name} url={complaint.assigned_to.avatar_url} size={16} />
              {complaint.assigned_to.name}
            </span>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="flex shrink-0 items-center gap-1.5">
          <label className="sr-only" htmlFor="assign-select">
            Assign complaint
          </label>
          <select
            id="assign-select"
            value={complaint.assigned_to ? String(complaint.assigned_to.bitrix_id) : ''}
            onChange={(event) => onAssign(event.target.value ? Number(event.target.value) : null)}
            disabled={busy}
            className="h-8 max-w-[10rem] rounded-lg border-0 bg-surface px-2 text-xs text-ink-700 shadow-sm ring-1 ring-inset ring-ink-200 focus:ring-2 focus:ring-brand-400"
          >
            <option value="">Unassigned</option>
            {admins.map((admin) => (
              <option key={admin.bitrix_id} value={String(admin.bitrix_id)}>
                {admin.name}
              </option>
            ))}
          </select>

          <div className="relative">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={busy}
            >
              Change status
              <IconChevronDown size={14} />
            </Button>

            {menuOpen && (
              <>
                <button
                  type="button"
                  aria-hidden="true"
                  tabIndex={-1}
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setMenuOpen(false)}
                />
                <ul
                  role="menu"
                  className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl bg-surface py-1 shadow-pop ring-1 ring-ink-100 animate-pop-in"
                >
                  {STATUSES.map((status) => {
                    const style = statusStyle(status)
                    const current = status === complaint.status
                    return (
                      <li key={status}>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={current}
                          onClick={() => {
                            setMenuOpen(false)
                            setStatusTarget(status)
                            setNote('')
                            setNoteError(null)
                          }}
                          className={clsx(
                            'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                            current ? 'cursor-default text-ink-500' : 'text-ink-700 hover:bg-ink-50',
                          )}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: style.solid }}
                            aria-hidden="true"
                          />
                          {style.label}
                          {current && <span className="ml-auto text-2xs">current</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      <Modal
        open={statusTarget !== null}
        title={statusTarget ? `Move to ${statusStyle(statusTarget).label}` : ''}
        description="The reason is posted into the thread and stored in the audit trail, so the agent can see why."
        onClose={() => setStatusTarget(null)}
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStatusTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void confirm()} disabled={busy}>
              {busy ? 'Saving…' : 'Change status'}
            </Button>
          </>
        }
      >
        <label htmlFor="status-note" className="block text-sm font-medium text-ink-700">
          Reason
        </label>
        <textarea
          id="status-note"
          rows={3}
          autoFocus
          value={note}
          onChange={(event) => {
            setNote(event.target.value)
            if (noteError) setNoteError(null)
          }}
          placeholder="e.g. waiting on the vendor to confirm the replacement photos"
          aria-invalid={noteError ? 'true' : undefined}
          aria-describedby={noteError ? 'status-note-error' : undefined}
          className={clsx(
            'mt-1.5 w-full resize-none rounded-lg px-3 py-2 text-base text-ink-800 ring-1 ring-inset',
            noteError ? 'ring-status-rejected' : 'ring-ink-200 focus:ring-2 focus:ring-brand-400',
          )}
        />
        {noteError && (
          <p id="status-note-error" role="alert" className="mt-1.5 text-xs text-status-rejected-ink">
            {noteError}
          </p>
        )}
      </Modal>
    </header>
  )
}
