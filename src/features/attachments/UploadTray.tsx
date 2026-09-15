import clsx from 'clsx'
import { formatBytes, formatEta, formatRate } from '@/lib/format'
import { uploadManager, type UploadTask } from '@/lib/uploads'
import { IconClose, IconFile, IconRetry } from '@/components/Icons'

/**
 * Live upload tray shown above the composer (and inside the new-complaint
 * modal). Progress is real: it advances only when the server acknowledges a
 * chunk. Cancel is always available, a transient failure retries and resumes by
 * itself, and none of this blocks typing.
 */
export function UploadTray({ tasks, className }: { tasks: UploadTask[]; className?: string }) {
  const live = tasks.filter((task) => task.status !== 'canceled')
  if (live.length === 0) return null

  return (
    <ul
      className={clsx('space-y-1.5', className)}
      aria-label="Attachments being uploaded"
      aria-live="polite"
    >
      {live.map((task) => (
        <li key={task.id}>
          <UploadRow task={task} />
        </li>
      ))}
    </ul>
  )
}

function UploadRow({ task }: { task: UploadTask }) {
  const percent = task.size > 0 ? Math.min(100, (task.uploadedBytes / task.size) * 100) : 0
  const remaining =
    task.bytesPerSecond > 0 ? (task.size - task.uploadedBytes) / task.bytesPerSecond : 0

  const failed = task.status === 'error'
  const done = task.status === 'done'

  return (
    <div
      className={clsx(
        'flex items-center gap-2.5 rounded-lg border bg-white/[0.05] px-2.5 py-2',
        failed ? 'border-[rgba(255,128,120,0.45)] bg-status-rejected-soft' : 'border-white/10',
      )}
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink-50 text-ink-500 ring-1 ring-ink-100">
        {task.previewUrl ? (
          <img src={task.previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <IconFile size={16} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">{task.name}</span>
          <span className="shrink-0 text-2xs tabular-nums text-ink-500">
            {done ? formatBytes(task.size) : `${formatBytes(task.uploadedBytes)} / ${formatBytes(task.size)}`}
          </span>
        </span>

        {done ? (
          <span className="mt-1 block text-2xs text-status-resolved-ink">Ready to send</span>
        ) : failed ? (
          <span className="mt-1 block text-2xs text-status-rejected-ink">
            {task.error ?? 'Upload failed'}
          </span>
        ) : (
          <>
            <span
              className="mt-1.5 block h-1 overflow-hidden rounded-full bg-ink-100"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percent)}
              aria-label={`Uploading ${task.name}`}
            >
              <span
                className="block h-full rounded-full bg-brand-500 transition-[width] duration-200 ease-out"
                style={{ width: `${percent}%` }}
              />
            </span>
            <span className="mt-1 flex items-center gap-1.5 text-2xs text-ink-500">
              <span className="tabular-nums">{Math.round(percent)}%</span>
              {task.status === 'uploading' && task.bytesPerSecond > 0 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{formatRate(task.bytesPerSecond)}</span>
                  {remaining > 0 ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{formatEta(remaining)}</span>
                    </>
                  ) : null}
                </>
              ) : null}
              {task.status === 'retrying' ? (
                <span className="text-status-progress-ink">
                  Connection dropped — retrying (attempt {task.attempt + 1})
                </span>
              ) : null}
              {task.status === 'offline' ? (
                <span className="text-status-progress-ink">Offline — will resume automatically</span>
              ) : null}
              {task.status === 'finalizing' ? <span>Verifying checksum…</span> : null}
              {task.status === 'preparing' ? <span>Preparing…</span> : null}
            </span>
          </>
        )}
      </span>

      {failed ? (
        <button
          type="button"
          onClick={() => uploadManager.retry(task.id)}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-600 hover:bg-ink-100"
        >
          <IconRetry size={14} />
          Retry
        </button>
      ) : null}

      <button
        type="button"
        aria-label={done ? `Remove ${task.name}` : `Cancel upload of ${task.name}`}
        title={done ? 'Remove' : 'Cancel upload'}
        onClick={() => (done ? uploadManager.remove(task.id) : uploadManager.cancel(task.id))}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-700"
      >
        <IconClose size={15} />
      </button>
    </div>
  )
}
