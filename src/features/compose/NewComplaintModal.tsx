import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { PRIORITIES, type Priority } from '@/api/types'
import { useCreateComplaint } from '@/api/queries'
import { priorityStyle } from '@/lib/status'
import { uploadManager } from '@/lib/uploads'
import { useUploads } from '@/hooks/useUploads'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/primitives'
import { IconPaperclip } from '@/components/Icons'
import { UploadTray } from '@/features/attachments/UploadTray'

const DRAFT_KEY = 'a7c.draft.new'
const SCOPE = 'new-complaint'

interface Draft {
  subject: string
  priority: Priority
  body: string
}

const EMPTY_DRAFT: Draft = { subject: '', priority: 'normal', body: '' }

function readDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return EMPTY_DRAFT
    const parsed = JSON.parse(raw) as Partial<Draft>
    return {
      subject: typeof parsed.subject === 'string' ? parsed.subject : '',
      priority: (PRIORITIES as readonly string[]).includes(parsed.priority ?? '')
        ? (parsed.priority as Priority)
        : 'normal',
      body: typeof parsed.body === 'string' ? parsed.body : '',
    }
  } catch {
    return EMPTY_DRAFT
  }
}

/**
 * New complaint. A focused modal rather than a route, so the list stays behind
 * it and nothing is lost on close — the draft is mirrored into sessionStorage
 * on every keystroke, because a long description typed in a CRM iframe is
 * exactly the thing an accidental click destroys.
 *
 * There is deliberately no category field. The owner rejected it, and no
 * substitute (department, type, tag) has been introduced in its place.
 */
export function NewComplaintModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: number) => void
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [errors, setErrors] = useState<{ subject?: string; body?: string }>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const create = useCreateComplaint()
  const fileRef = useRef<HTMLInputElement>(null)
  const tasks = useUploads(SCOPE)

  const uploading = tasks.some((task) =>
    ['preparing', 'uploading', 'retrying', 'offline', 'finalizing'].includes(task.status),
  )

  useEffect(() => {
    if (open) setDraft(readDraft())
  }, [open])

  const update = (patch: Partial<Draft>) => {
    setDraft((current) => {
      const next = { ...current, ...patch }
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next))
      } catch {
        /* storage unavailable — the in-memory draft still works */
      }
      return next
    })
  }

  const close = () => {
    setErrors({})
    setSubmitError(null)
    onClose()
  }

  const submit = async () => {
    const nextErrors: { subject?: string; body?: string } = {}
    if (draft.subject.trim().length < 5) nextErrors.subject = 'Give it a subject of at least 5 characters.'
    if (draft.body.trim().length < 10) nextErrors.body = 'Describe what happened — at least 10 characters.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitError(null)
    try {
      const complaint = await create.mutateAsync({
        subject: draft.subject.trim(),
        priority: draft.priority,
        body: draft.body.trim(),
        attachment_ids: uploadManager.readyAttachmentIds(SCOPE),
      })
      try {
        sessionStorage.removeItem(DRAFT_KEY)
      } catch {
        /* non-fatal */
      }
      uploadManager.clearScope(SCOPE)
      setDraft(EMPTY_DRAFT)
      onCreated(complaint.id)
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'The complaint could not be raised. Try again.',
      )
    }
  }

  return (
    <Modal
      open={open}
      title="Raise a complaint"
      description="It goes straight to the admin team. You can attach photos, video or documents of any size."
      onClose={close}
      footer={
        <>
          <span className="mr-auto text-2xs text-ink-500">
            {uploading ? 'Attachments are still uploading…' : 'Your draft is kept if you close this.'}
          </span>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={create.isPending || uploading}>
            {create.isPending ? 'Sending…' : 'Raise complaint'}
          </Button>
        </>
      }
    >
      <div
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault()
            setDragging(true)
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const files = Array.from(event.dataTransfer.files)
          if (files.length) uploadManager.enqueue(files, SCOPE)
        }}
        className={clsx('space-y-4 rounded-xl', dragging && 'ring-2 ring-brand-400 ring-offset-4')}
      >
        <div>
          <label htmlFor="new-subject" className="block text-sm font-medium text-ink-700">
            Subject
          </label>
          <input
            id="new-subject"
            value={draft.subject}
            onChange={(event) => update({ subject: event.target.value })}
            placeholder="Short summary — what is wrong?"
            aria-invalid={errors.subject ? 'true' : undefined}
            aria-describedby={errors.subject ? 'new-subject-error' : undefined}
            className={clsx(
              'mt-1.5 h-10 w-full rounded-lg border-0 px-3 text-base text-ink-800 ring-1 ring-inset',
              errors.subject ? 'ring-status-rejected' : 'ring-ink-200 focus:ring-2 focus:ring-brand-400',
            )}
          />
          {errors.subject ? (
            <p id="new-subject-error" role="alert" className="mt-1.5 text-xs text-status-rejected-ink">
              {errors.subject}
            </p>
          ) : null}
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-ink-700">Priority</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {PRIORITIES.map((priority) => {
              const style = priorityStyle(priority)
              const selected = draft.priority === priority
              return (
                <button
                  key={priority}
                  type="button"
                  onClick={() => update({ priority })}
                  aria-pressed={selected}
                  className={clsx(
                    'h-8 rounded-lg px-3 text-sm font-medium ring-1 ring-inset transition-colors',
                    selected ? 'ring-transparent' : 'bg-white/[0.05] text-ink-500 ring-white/10 hover:bg-white/[0.09]',
                  )}
                  style={selected ? { background: style.soft, color: style.ink } : undefined}
                >
                  {style.label}
                </button>
              )
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor="new-body" className="block text-sm font-medium text-ink-700">
            What happened?
          </label>
          <textarea
            id="new-body"
            rows={6}
            value={draft.body}
            onChange={(event) => update({ body: event.target.value })}
            placeholder="Dates, unit or deal reference, who you spoke to, and what you expected to happen."
            aria-invalid={errors.body ? 'true' : undefined}
            aria-describedby={errors.body ? 'new-body-error' : undefined}
            className={clsx(
              'mt-1.5 w-full resize-y rounded-lg border-0 px-3 py-2.5 text-base leading-relaxed text-ink-800 ring-1 ring-inset',
              errors.body ? 'ring-status-rejected' : 'ring-ink-200 focus:ring-2 focus:ring-brand-400',
            )}
          />
          {errors.body ? (
            <p id="new-body-error" role="alert" className="mt-1.5 text-xs text-status-rejected-ink">
              {errors.body}
            </p>
          ) : null}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink-700">Attachments</span>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              <IconPaperclip size={15} />
              Add files
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            aria-label="Attach files to this complaint"
            className="sr-only"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])
              if (files.length) uploadManager.enqueue(files, SCOPE)
              event.target.value = ''
            }}
          />
          {tasks.length === 0 ? (
            <p className="mt-1.5 rounded-lg border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-500">
              Drop files here, or use “Add files”. No size limit — large videos upload in the
              background and resume if the connection drops.
            </p>
          ) : (
            <UploadTray tasks={tasks} className="mt-2" />
          )}
        </div>

        {submitError ? (
          <p role="alert" className="rounded-lg bg-status-rejected-soft px-3 py-2 text-sm text-status-rejected-ink">
            {submitError}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
