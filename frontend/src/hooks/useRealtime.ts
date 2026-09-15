import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { eventsUrl } from '@/api/client'
import { patchSummaryEverywhere, qk, upsertMessage } from '@/api/queries'
import type { ServerEvent } from '@/api/types'

export type RealtimeState = 'connecting' | 'live' | 'reconnecting' | 'polling'

/** Polling cadence used whenever the stream is not live. */
export const POLL_INTERVAL_MS = 10_000

const MAX_BACKOFF_MS = 30_000

/**
 * Subscribes to the SSE stream and applies events to the TanStack Query cache
 * surgically. If the stream drops we fall back to 10-second polling (the REST
 * endpoints are sufficient on their own) and retry the stream with exponential
 * backoff. The indicator this drives is a quiet inline chip, never a modal.
 */
export function useRealtime(enabled: boolean): { state: RealtimeState; pollMs: number | false } {
  const qc = useQueryClient()
  const [state, setState] = useState<RealtimeState>('connecting')
  const attemptRef = useRef(0)
  const sourceRef = useRef<EventSource | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (typeof EventSource === 'undefined') {
      setState('polling')
      return
    }

    let disposed = false

    const connect = () => {
      if (disposed) return
      const source = new EventSource(eventsUrl())
      sourceRef.current = source

      source.onopen = () => {
        attemptRef.current = 0
        setState('live')
      }

      source.onmessage = (evt: MessageEvent<string>) => {
        let parsed: ServerEvent
        try {
          parsed = JSON.parse(evt.data) as ServerEvent
        } catch {
          return
        }
        applyEvent(qc, parsed)
      }

      source.onerror = () => {
        source.close()
        sourceRef.current = null
        if (disposed) return
        const attempt = ++attemptRef.current
        setState(attempt === 1 ? 'reconnecting' : 'polling')
        const delay = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS)
        timerRef.current = window.setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      disposed = true
      sourceRef.current?.close()
      sourceRef.current = null
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [enabled, qc])

  return { state, pollMs: state === 'live' ? false : POLL_INTERVAL_MS }
}

export function applyEvent(qc: ReturnType<typeof useQueryClient>, event: ServerEvent): void {
  switch (event.type) {
    case 'message.created':
      upsertMessage(qc, event.complaint_id, event.message)
      void qc.invalidateQueries({ queryKey: qk.complaintsRoot, refetchType: 'active' })
      break
    case 'complaint.updated':
      patchSummaryEverywhere(qc, event.complaint)
      qc.setQueryData(qk.complaint(event.complaint.id), (old: unknown) =>
        old && typeof old === 'object' ? { ...(old as object), ...event.complaint } : old,
      )
      void qc.invalidateQueries({ queryKey: qk.stats })
      break
    case 'complaint.created':
      void qc.invalidateQueries({ queryKey: qk.complaintsRoot })
      void qc.invalidateQueries({ queryKey: qk.stats })
      break
    case 'read.updated':
      void qc.invalidateQueries({ queryKey: qk.messages(event.complaint_id), refetchType: 'active' })
      break
  }
}
