import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api } from '@/api/client'
import { qk, upsertMessage, usePatchComplaint, useComplaint, useMessages } from '@/api/queries'
import type { ApiUser, Attachment, DeliveryState, Me, Message, Status } from '@/api/types'
import { dayKey, formatDaySeparator } from '@/lib/format'
import { fitWindow } from '@/lib/bx24'
import { uploadManager } from '@/lib/uploads'
import { EmptyState, ErrorState, Skeleton } from '@/components/primitives'
import { IconArrowDown, IconInbox, IconPaperclip } from '@/components/Icons'
import { ThreadHeader } from './ThreadHeader'
import { Composer } from './Composer'
import { MessageBubble, PendingBubble, SystemMessage, type PendingMessage } from './MessageBubble'

const NEAR_BOTTOM_PX = 120

/**
 * The WhatsApp-feeling surface: bubbles, day separators, delivery ticks,
 * optimistic send, drag-and-drop and paste-to-upload, and a jump-to-latest pill
 * instead of yanking the viewport away from someone reading history.
 */
export function Thread({
  complaintId,
  me,
  admins,
  onBack,
  pollMs,
}: {
  complaintId: number
  me: Me
  admins: ApiUser[]
  onBack: (() => void) | null
  /**
   * Polling cadence handed down from the realtime hook: `false` while the SSE
   * stream is live, 10s while it is not, so the thread stays correct without
   * the stream.
   */
  pollMs: number | false
}) {
  const qc = useQueryClient()
  const isAdmin = me.role === 'admin'
  const scope = `complaint:${complaintId}`

  const complaintQuery = useComplaint(complaintId)
  const messagesQuery = useMessages(complaintId, pollMs)
  const patch = usePatchComplaint(complaintId)

  const [pending, setPending] = useState<PendingMessage[]>([])
  const [dragging, setDragging] = useState(false)
  const [newCount, setNewCount] = useState(0)
  const [atBottom, setAtBottom] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const lastSeenIdRef = useRef<number | null>(null)
  const dragDepth = useRef(0)
  const readSentRef = useRef<number>(0)

  const messages = useMemo(() => messagesQuery.data?.results ?? [], [messagesQuery.data])
  const lastMessage = messages[messages.length - 1]

  // Reset per-complaint UI state when the selection changes.
  useEffect(() => {
    setPending([])
    setNewCount(0)
    atBottomRef.current = true
    setAtBottom(true)
    lastSeenIdRef.current = null
    readSentRef.current = 0
  }, [complaintId])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
    atBottomRef.current = true
    setAtBottom(true)
    setNewCount(0)
  }, [])

  // Arrival policy: follow the conversation only when the reader is already at
  // the bottom. Otherwise count the new messages and offer the pill.
  useLayoutEffect(() => {
    if (!lastMessage) return
    const previous = lastSeenIdRef.current
    lastSeenIdRef.current = lastMessage.id

    if (previous === null) {
      requestAnimationFrame(() => scrollToBottom('auto'))
      return
    }
    if (lastMessage.id === previous) return

    if (atBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom('smooth'))
    } else {
      const unseen = messages.filter((m) => m.id > previous).length
      setNewCount((count) => count + Math.max(1, unseen))
    }
  }, [lastMessage, messages, scrollToBottom])

  // The iframe has to be told when our height changes, or the CRM clips us.
  useEffect(() => {
    fitWindow()
  }, [messages.length, pending.length, complaintId])

  // Images and videos decode after the bubble is laid out, which pushes the
  // newest message below the fold. Stay pinned while the reader is at the
  // bottom; never yank the viewport when they are not.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current) bottomRef.current?.scrollIntoView({ block: 'end' })
    })
    Array.from(el.children).forEach((child) => observer.observe(child))
    return () => observer.disconnect()
  }, [complaintId, messages.length])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const near = distance <= NEAR_BOTTOM_PX
    atBottomRef.current = near
    setAtBottom(near)
    if (near) setNewCount(0)
  }

  // Read receipts: only claim "read" when the newest message is actually on
  // screen, which is what makes the counterpart's second tick meaningful.
  useEffect(() => {
    if (!lastMessage || !atBottom) return
    if (readSentRef.current >= lastMessage.id) return
    readSentRef.current = lastMessage.id
    const id = lastMessage.id
    const timer = window.setTimeout(() => {
      api
        .markRead(complaintId, id)
        .then(() => qc.invalidateQueries({ queryKey: qk.complaintsRoot, refetchType: 'active' }))
        .catch(() => {
          // A failed receipt is cosmetic; it retries on the next arrival.
          readSentRef.current = 0
        })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [lastMessage, atBottom, complaintId, qc])

  const send = useCallback(
    async (body: string, attachmentIds: string[], isInternal: boolean, reuseId?: string) => {
      const clientId = reuseId ?? `c_${Math.random().toString(36).slice(2)}`
      const attachments = attachmentsFromIds(attachmentIds, scope)

      setPending((current) => {
        const next = current.filter((p) => p.client_id !== clientId)
        return [
          ...next,
          {
            client_id: clientId,
            body,
            is_internal: isInternal,
            attachments,
            created_at: new Date().toISOString(),
            state: 'pending',
          },
        ]
      })
      requestAnimationFrame(() => scrollToBottom('smooth'))

      try {
        const created = await api.createMessage(complaintId, {
          body,
          attachment_ids: attachmentIds,
          is_internal: isInternal,
          client_id: clientId,
        })
        upsertMessage(qc, complaintId, created)
        setPending((current) => current.filter((p) => p.client_id !== clientId))
        void qc.invalidateQueries({ queryKey: qk.complaintsRoot, refetchType: 'active' })
      } catch {
        // Never silently vanish: the bubble stays, marked as not sent, with a retry.
        setPending((current) =>
          current.map((p) => (p.client_id === clientId ? { ...p, state: 'failed' } : p)),
        )
      }
    },
    [complaintId, qc, scope, scrollToBottom],
  )

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length) uploadManager.enqueue(files, scope)
  }

  if (complaintQuery.isError || messagesQuery.isError) {
    return (
      <ErrorState
        title="Could not load this complaint"
        body="The server did not answer. Nothing you have typed has been lost."
        onRetry={() => {
          void complaintQuery.refetch()
          void messagesQuery.refetch()
        }}
        className="h-full"
      />
    )
  }

  if (complaintQuery.isLoading || !complaintQuery.data) {
    return <ThreadSkeleton />
  }

  const complaint = complaintQuery.data
  const groups = groupByDay(messages)

  return (
    <section
      className="relative flex h-full min-h-0 flex-col bg-canvas"
      aria-label={`Complaint ${complaint.ticket_no}`}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <ThreadHeader
        complaint={complaint}
        isAdmin={isAdmin}
        admins={admins}
        onBack={onBack}
        busy={patch.isPending}
        onChangeStatus={async (status: Status, note: string) => {
          await patch.mutateAsync({ status, note })
        }}
        onAssign={(bitrixId) => patch.mutate({ assigned_to: bitrixId })}
      />

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="thread-paper relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3"
      >
        {messagesQuery.isLoading ? (
          <BubbleSkeletons />
        ) : messages.length === 0 && pending.length === 0 ? (
          <EmptyState
            icon={<IconInbox size={24} />}
            title="No messages yet"
            body="Write the first message below. You can attach photos, video or documents of any size."
            className="h-full"
          />
        ) : (
          <ol className="mx-auto flex w-full max-w-4xl flex-col" aria-live="polite" aria-label="Messages">
            {groups.map((group) => (
              <li key={group.key}>
                <ol className="flex flex-col">
                  <li className="sticky top-0 z-10 flex justify-center py-2">
                    <span className="rounded-full bg-[#0d1730]/70 px-2.5 py-0.5 text-2xs font-medium text-ink-500 ring-1 ring-inset ring-white/10 backdrop-blur">
                      {formatDaySeparator(group.at)}
                    </span>
                  </li>
                  {group.messages.map((message, index) =>
                    message.kind === 'system' ? (
                      <SystemMessage key={message.id} message={message} />
                    ) : (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        own={message.sender?.bitrix_id === me.user.bitrix_id}
                        showSender={showSender(group.messages, index)}
                        delivery={deliveryOf(message)}
                      />
                    ),
                  )}
                </ol>
              </li>
            ))}

            {pending.map((item) => (
              <PendingBubble
                key={item.client_id}
                pending={item}
                onRetry={() =>
                  void send(
                    item.body,
                    item.attachments.map((a) => a.id),
                    item.is_internal,
                    item.client_id,
                  )
                }
                onDiscard={() =>
                  setPending((current) => current.filter((p) => p.client_id !== item.client_id))
                }
              />
            ))}
          </ol>
        )}

        <div ref={bottomRef} />
      </div>

      {!atBottom ? (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className={clsx(
            'absolute bottom-24 left-1/2 z-20 -translate-x-1/2 animate-pop-in',
            'glass-raised inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-ink-800',
            'shadow-pop ring-1 ring-ink-100 hover:bg-ink-50',
          )}
        >
          <IconArrowDown size={15} />
          {newCount > 0 ? `${newCount} new message${newCount === 1 ? '' : 's'}` : 'Jump to latest'}
        </button>
      ) : null}

      <Composer
        scope={scope}
        isAdmin={isAdmin}
        onSend={(body, attachmentIds, isInternal) => void send(body, attachmentIds, isInternal)}
      />

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-brand-50/85 backdrop-blur-[1px] animate-fade-in">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-brand-400 bg-white/80 px-10 py-8 text-center">
            <IconPaperclip size={28} className="text-brand-600" />
            <p className="text-lg font-semibold text-ink-800">Drop to attach</p>
            <p className="text-sm text-ink-500">Any file type, any size. Uploads resume by themselves.</p>
          </div>
        </div>
      ) : null}
    </section>
  )
}

/* ------------------------------------------------------------------ helpers */

function deliveryOf(message: Message): DeliveryState {
  return message.read_by_counterpart ? 'read' : 'sent'
}

/** Only label the first bubble of a run from the same sender, like WhatsApp. */
function showSender(messages: Message[], index: number): boolean {
  const current = messages[index]
  const previous = messages[index - 1]
  if (!current) return false
  if (!previous || previous.kind === 'system') return true
  return previous.sender?.bitrix_id !== current.sender?.bitrix_id
}

interface DayGroup {
  key: string
  at: string
  messages: Message[]
}

export function groupByDay(messages: Message[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const message of messages) {
    const key = dayKey(message.created_at)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.messages.push(message)
    else groups.push({ key, at: message.created_at, messages: [message] })
  }
  return groups
}

function attachmentsFromIds(ids: string[], scope: string): Attachment[] {
  const tasks = uploadManager.tasksFor(scope)
  return ids.map((id) => {
    const task = tasks.find((t) => t.attachment?.id === id)
    if (task?.attachment) {
      // Reuse the local object URL so the optimistic bubble shows the real
      // thumbnail instead of a grey box while the server round-trips.
      return task.previewUrl ? { ...task.attachment, thumbnail_url: task.previewUrl } : task.attachment
    }
    return {
      id,
      original_name: 'attachment',
      mime: 'application/octet-stream',
      size_bytes: 0,
      width: null,
      height: null,
      duration: null,
      url: '#',
      thumbnail_url: null,
    }
  })
}

/* ---------------------------------------------------------------- skeletons */

function ThreadSkeleton() {
  return (
    <div className="flex h-full flex-col bg-canvas" aria-busy="true" aria-label="Loading complaint">
      <div className="border-b border-ink-100 bg-surface px-4 py-3">
        <Skeleton className="h-2.5 w-28" />
        <Skeleton className="mt-2 h-4 w-2/3" />
        <div className="mt-2.5 flex gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
      <div className="thread-paper flex-1 px-5 py-4">
        <BubbleSkeletons />
      </div>
      <div className="border-t border-ink-100 bg-surface px-4 py-3">
        <Skeleton className="h-10 w-full rounded-2xl" />
      </div>
    </div>
  )
}

function BubbleSkeletons() {
  const widths = ['62%', '38%', '74%', '46%', '58%']
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-2.5">
      {widths.map((width, index) => (
        <div key={index} className={clsx('flex', index % 2 === 1 ? 'justify-end' : 'justify-start')}>
          <span
            className={clsx('skeleton block h-14', index % 2 === 1 ? 'bubble-out' : 'bubble-in')}
            style={{ width }}
          />
        </div>
      ))}
      <span className="sr-only">Loading messages</span>
    </div>
  )
}
