import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { uploadManager } from '@/lib/uploads'
import { useUploads } from '@/hooks/useUploads'
import { UploadTray } from '@/features/attachments/UploadTray'
import { IconButton } from '@/components/primitives'
import { IconLock, IconPaperclip, IconSend } from '@/components/Icons'

const MAX_ROWS_PX = 168

/**
 * Message composer.
 *
 * Enter sends, Shift+Enter breaks the line, the textarea grows to a cap and then
 * scrolls. Attachments arrive by button, by drag-and-drop (handled by the thread
 * around this component) or by paste, which is how screenshots actually get
 * shared.
 *
 * If an upload is still in flight when the user hits send, the message is held
 * and dispatched the moment the last chunk lands — the user is never blocked
 * from typing and never loses what they wrote.
 */
export function Composer({
  scope,
  onSend,
  isAdmin,
  disabled,
  disabledReason,
}: {
  scope: string
  onSend: (body: string, attachmentIds: string[], isInternal: boolean) => void
  isAdmin: boolean
  disabled?: boolean
  disabledReason?: string
}) {
  const [value, setValue] = useState('')
  const [internal, setInternal] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const tasks = useUploads(scope)

  const busy = tasks.some((task) =>
    ['preparing', 'uploading', 'retrying', 'offline', 'finalizing'].includes(task.status),
  )
  const failed = tasks.some((task) => task.status === 'error')
  const readyCount = tasks.filter((task) => task.status === 'done').length

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_PX)}px`
    el.style.overflowY = el.scrollHeight > MAX_ROWS_PX ? 'auto' : 'hidden'
  }, [value])

  const dispatch = useCallback(() => {
    const body = value.trim()
    const attachmentIds = uploadManager.readyAttachmentIds(scope)
    if (!body && attachmentIds.length === 0) return
    onSend(body, attachmentIds, internal)
    setValue('')
    setWaiting(false)
    uploadManager.clearScope(scope)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [internal, onSend, scope, value])

  // A queued send fires as soon as the last chunk is acknowledged.
  useEffect(() => {
    if (!waiting) return
    if (busy) return
    if (failed) {
      setWaiting(false)
      return
    }
    dispatch()
  }, [waiting, busy, failed, dispatch])

  const submit = () => {
    if (disabled) return
    if (busy) {
      if (value.trim() || readyCount > 0) setWaiting(true)
      return
    }
    dispatch()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files)
    if (files.length === 0) return
    event.preventDefault()
    uploadManager.enqueue(files, scope)
  }

  if (disabled) {
    return (
      <div className="border-t border-ink-100 bg-surface px-4 py-3.5 text-center text-sm text-ink-500">
        {disabledReason ?? 'This complaint is closed.'}
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'border-t transition-colors duration-200',
        internal ? 'border-[rgba(240,180,92,0.34)] bg-[rgba(240,180,92,0.10)]' : 'border-ink-100',
      )}
    >
      {internal ? (
        <p className="flex items-center gap-1.5 border-b border-[rgba(240,180,92,0.28)] px-4 py-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-status-progress-ink">
          <IconLock size={13} />
          Internal note — the agent will not see this
        </p>
      ) : null}

      <div className="px-4 pt-2.5">
        <UploadTray tasks={tasks} className="mb-2" />
      </div>

      <div className="flex items-end gap-1.5 px-3 pb-2.5">
        <input
          ref={fileRef}
          type="file"
          multiple
          aria-label="Attach files to this message"
          className="sr-only"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            if (files.length) uploadManager.enqueue(files, scope)
            event.target.value = ''
          }}
        />

        <IconButton label="Attach files" onClick={() => fileRef.current?.click()}>
          <IconPaperclip size={19} />
        </IconButton>

        {isAdmin ? (
          <IconButton
            label="Internal note"
            title={
              internal
                ? 'Internal note is on — switch back to a reply the agent can see'
                : 'Write an internal note the agent cannot see'
            }
            aria-pressed={internal}
            onClick={() => setInternal((v) => !v)}
            className={clsx(
              internal &&
                'bg-[rgba(240,180,92,0.22)] text-status-progress-ink hover:bg-[rgba(240,180,92,0.3)] hover:text-status-progress-ink',
            )}
          >
            <IconLock size={18} />
          </IconButton>
        ) : null}

        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            aria-label={internal ? 'Write an internal note' : 'Write a message'}
            placeholder={
              internal ? 'Internal note, visible to admins only…' : 'Write a message…  (Enter to send, Shift+Enter for a new line)'
            }
            className={clsx(
              'block max-h-[168px] w-full resize-none rounded-2xl border-0 px-3.5 py-2.5 text-base leading-relaxed shadow-sm',
              'ring-1 ring-inset placeholder:text-ink-400 focus:ring-2',
              internal
                ? 'bg-[rgba(240,180,92,0.10)] text-ink-800 ring-[rgba(240,180,92,0.38)] focus:ring-status-progress'
                : 'bg-white/[0.05] text-ink-800 ring-white/10 focus:bg-white/[0.09] focus:ring-brand-300',
            )}
          />
        </div>

        <button
          type="button"
          onClick={submit}
          aria-label={waiting ? 'Message queued until the upload finishes' : 'Send message'}
          title={waiting ? 'Sends when the upload finishes' : 'Send'}
          disabled={!value.trim() && readyCount === 0 && !busy}
          className={clsx(
            'mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-150',
            'disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-ink-300',
            internal
              ? 'bg-status-progress text-[#2a1c05] hover:brightness-110'
              : 'bg-brand-400 text-[#04201c] hover:bg-brand-300 active:scale-95',
          )}
        >
          {waiting ? (
            <span className="h-3.5 w-3.5 animate-pulse-soft rounded-full bg-current opacity-80" aria-hidden="true" />
          ) : (
            <IconSend size={19} />
          )}
        </button>
      </div>

      {waiting ? (
        <p className="px-4 pb-2 text-2xs text-ink-500" role="status">
          Waiting for the upload to finish — your message will send by itself.
        </p>
      ) : null}
      {failed && waiting === false && tasks.some((t) => t.status === 'error') ? (
        <p className="px-4 pb-2 text-2xs text-status-rejected-ink" role="status">
          An attachment failed to upload. Retry or remove it, then send.
        </p>
      ) : null}
    </div>
  )
}
