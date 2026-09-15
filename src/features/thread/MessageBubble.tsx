import clsx from 'clsx'
import type { Attachment, DeliveryState, Message } from '@/api/types'
import { formatTime } from '@/lib/format'
import { Avatar } from '@/components/primitives'
import { IconLock, IconRetry, TickIcon } from '@/components/Icons'
import { AttachmentGrid } from '@/features/attachments/Attachments'

export interface PendingMessage {
  client_id: string
  body: string
  is_internal: boolean
  attachments: Attachment[]
  created_at: string
  state: 'pending' | 'failed'
}

/** Centred pill for `kind=system` messages — status changes, assignment. */
export function SystemMessage({ message }: { message: Message }) {
  return (
    <li className="flex justify-center py-1.5 animate-bubble-in">
      <p className="max-w-[80%] rounded-full bg-white/[0.07] px-3 py-1 text-center text-2xs leading-relaxed text-ink-500 ring-1 ring-inset ring-white/10">
        {message.body}
      </p>
    </li>
  )
}

export function MessageBubble({
  message,
  own,
  showSender,
  delivery,
}: {
  message: Message
  own: boolean
  showSender: boolean
  delivery: DeliveryState
}) {
  return (
    <Bubble
      own={own}
      internal={message.is_internal}
      senderName={showSender && !own ? (message.sender?.name ?? 'Unknown') : null}
      senderAvatar={message.sender?.avatar_url ?? null}
      body={message.body}
      attachments={message.attachments}
      time={formatTime(message.created_at)}
      timestamp={message.created_at}
      delivery={own ? delivery : null}
    />
  )
}

export function PendingBubble({
  pending,
  onRetry,
  onDiscard,
}: {
  pending: PendingMessage
  onRetry: () => void
  onDiscard: () => void
}) {
  return (
    <Bubble
      own
      internal={pending.is_internal}
      senderName={null}
      senderAvatar={null}
      body={pending.body}
      attachments={pending.attachments}
      time={formatTime(pending.created_at)}
      timestamp={pending.created_at}
      delivery={pending.state}
      failureAction={
        pending.state === 'failed' ? (
          <span className="mt-1 flex items-center justify-end gap-2 text-2xs text-status-rejected-ink">
            <span>Not sent</span>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:bg-status-rejected-soft"
            >
              <IconRetry size={13} />
              Retry
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="rounded px-1.5 py-0.5 font-medium text-ink-500 hover:bg-ink-100"
            >
              Discard
            </button>
          </span>
        ) : null
      }
    />
  )
}

function Bubble({
  own,
  internal,
  senderName,
  senderAvatar,
  body,
  attachments,
  time,
  timestamp,
  delivery,
  failureAction,
}: {
  own: boolean
  internal: boolean
  senderName: string | null
  senderAvatar: string | null
  body: string
  attachments: Attachment[]
  time: string
  timestamp: string
  delivery: DeliveryState | null
  failureAction?: React.ReactNode
}) {
  return (
    <li
      className={clsx('flex gap-2 py-0.5 animate-bubble-in', own ? 'justify-end' : 'justify-start')}
    >
      {!own && senderName ? (
        <Avatar name={senderName} url={senderAvatar} size={28} className="mt-auto mb-1" />
      ) : !own ? (
        <span className="w-7 shrink-0" aria-hidden="true" />
      ) : null}

      <div
        className={clsx(
          'relative max-w-[min(78%,44rem)] px-3 py-2 shadow-bubble',
          own ? 'bubble-out' : 'bubble-in',
          // Own messages are lit by the brand accent, incoming ones are plain
          // glass. Both stay translucent so the backdrop still reads through
          // the thread; an opaque bubble would break the material.
          internal
            ? 'bg-[rgba(240,180,92,0.15)] ring-1 ring-inset ring-[rgba(240,180,92,0.38)]'
            : own
              ? 'bg-[rgba(53,189,166,0.20)] ring-1 ring-inset ring-[rgba(95,211,190,0.34)]'
              : 'bg-white/[0.07] ring-1 ring-inset ring-white/10',
          delivery === 'failed' && 'opacity-90 ring-[rgba(255,128,120,0.55)]',
          delivery === 'pending' && 'opacity-80',
        )}
      >
        {internal ? (
          <span className="mb-1 flex items-center gap-1 text-2xs font-semibold uppercase tracking-[0.06em] text-status-progress-ink">
            <IconLock size={12} />
            Internal note — not visible to the agent
          </span>
        ) : null}

        {senderName && !own ? (
          <span className="mb-0.5 block text-2xs font-semibold text-ink-500">{senderName}</span>
        ) : null}

        {body ? (
          <p className="wrap-anywhere whitespace-pre-wrap text-base leading-relaxed text-ink-800">
            {body}
          </p>
        ) : null}

        <AttachmentGrid attachments={attachments} own={own} />

        <span
          className={clsx(
            'mt-1 flex items-center justify-end gap-1 text-2xs tabular-nums',
            internal ? 'text-[#8a6412]' : own ? 'text-brand-800' : 'text-ink-500',
          )}
        >
          <time dateTime={timestamp}>{time}</time>
          {delivery ? (
            <span
              role="img"
              className={clsx(delivery === 'read' ? 'text-status-open' : undefined)}
              aria-label={DELIVERY_LABEL[delivery]}
              title={DELIVERY_LABEL[delivery]}
            >
              <TickIcon state={delivery} />
            </span>
          ) : null}
        </span>

        {failureAction}
      </div>
    </li>
  )
}

const DELIVERY_LABEL: Record<DeliveryState, string> = {
  pending: 'Sending',
  sent: 'Sent',
  read: 'Read',
  failed: 'Not sent',
}
