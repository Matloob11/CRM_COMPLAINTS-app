import { useEffect, useState } from 'react'
import clsx from 'clsx'
import type { Attachment } from '@/api/types'
import { formatBytes, formatDuration } from '@/lib/format'
import { IconClose, IconDownload, IconFile, IconPlay } from '@/components/Icons'
import { IconButton } from '@/components/primitives'

/**
 * Attachment rendering.
 *  - images: inline thumbnail, click opens a lightbox
 *  - video: inline player with a poster, never autoplaying
 *  - everything else: a file card with icon, name and human-readable size
 */
export function AttachmentGrid({
  attachments,
  own,
}: {
  attachments: Attachment[]
  own: boolean
}) {
  const [lightbox, setLightbox] = useState<Attachment | null>(null)
  if (attachments.length === 0) return null

  const images = attachments.filter((a) => a.mime.startsWith('image/'))
  const videos = attachments.filter((a) => a.mime.startsWith('video/'))
  const files = attachments.filter((a) => !a.mime.startsWith('image/') && !a.mime.startsWith('video/'))

  return (
    <div className="mt-1 space-y-1.5">
      {images.length > 0 ? (
        <div
          className={clsx(
            'grid gap-1',
            images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-3',
          )}
        >
          {images.map((image) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setLightbox(image)}
              className="group relative overflow-hidden rounded-lg bg-ink-100 focus-visible:ring-2 focus-visible:ring-brand-400"
              aria-label={`Open image ${image.original_name}`}
            >
              <img
                src={image.thumbnail_url ?? image.url}
                alt={image.original_name}
                loading="lazy"
                className={clsx(
                  'w-full object-cover transition-transform duration-200 group-hover:scale-[1.015]',
                  images.length === 1 ? 'max-h-72' : 'h-28',
                )}
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent px-2 pb-1 pt-6 text-left text-2xs text-white/95">
                {formatBytes(image.size_bytes)}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {videos.map((video) => (
        <VideoCard key={video.id} attachment={video} />
      ))}

      {files.map((file) => (
        <FileCard key={file.id} attachment={file} own={own} />
      ))}

      {lightbox ? <Lightbox attachment={lightbox} onClose={() => setLightbox(null)} /> : null}
    </div>
  )
}

function VideoCard({ attachment }: { attachment: Attachment }) {
  const [active, setActive] = useState(false)
  const duration = formatDuration(attachment.duration)

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="group relative block w-full overflow-hidden rounded-lg bg-[#0b1225] text-left"
        aria-label={`Play video ${attachment.original_name}`}
      >
        {attachment.thumbnail_url ? (
          <img
            src={attachment.thumbnail_url}
            alt=""
            className="h-40 w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
          />
        ) : (
          <div className="h-40 w-full bg-gradient-to-br from-ink-700 to-ink-900" />
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-[#0b1225] shadow-pop transition-transform duration-150 group-hover:scale-105">
            <IconPlay size={22} />
          </span>
        </span>
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-1.5 pt-8 text-2xs text-white">
          <span className="truncate">{attachment.original_name}</span>
          <span className="shrink-0 tabular-nums">
            {duration ? `${duration} · ` : ''}
            {formatBytes(attachment.size_bytes)}
          </span>
        </span>
      </button>
    )
  }

  return (
    <video
      src={attachment.url}
      poster={attachment.thumbnail_url ?? undefined}
      controls
      preload="metadata"
      className="w-full rounded-lg bg-black"
    >
      <track kind="captions" />
    </video>
  )
}

function FileCard({ attachment, own }: { attachment: Attachment; own: boolean }) {
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className={clsx(
        'flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors',
        own
          ? 'border-[rgba(95,211,190,0.3)] bg-white/[0.07] hover:bg-white/[0.11]'
          : 'border-white/10 bg-white/[0.05] hover:bg-white/[0.09]',
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/[0.08] text-ink-500 ring-1 ring-inset ring-white/10">
        <IconFile size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-800">
          {attachment.original_name}
        </span>
        <span className="block text-2xs uppercase tracking-wide text-ink-500">
          {extensionOf(attachment)} · {formatBytes(attachment.size_bytes)}
        </span>
      </span>
      <IconDownload size={16} className="shrink-0 text-ink-500" />
    </a>
  )
}

function extensionOf(attachment: Attachment): string {
  const dot = attachment.original_name.lastIndexOf('.')
  if (dot > 0) return attachment.original_name.slice(dot + 1)
  return attachment.mime.split('/')[1] ?? 'file'
}

function Lightbox({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.original_name}
      className="fixed inset-0 z-50 flex flex-col bg-[#04070f]/92 animate-fade-in"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-base font-medium">{attachment.original_name}</p>
          <p className="text-2xs text-white/60">{formatBytes(attachment.size_bytes)}</p>
        </div>
        <IconButton label="Close image" onClick={onClose} className="text-white hover:bg-white/15">
          <IconClose size={20} />
        </IconButton>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        <img
          src={attachment.url}
          alt={attachment.original_name}
          className="max-h-full max-w-full rounded-lg object-contain shadow-pop"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  )
}
