import type {
  ApiUser,
  Attachment,
  ComplaintSummary,
  CreateComplaintPayload,
  CreateMessagePayload,
  Message,
  PatchComplaintPayload,
  Role,
  ServerEvent,
  Status,
} from '@/api/types'
import { statusLabel } from '@/lib/status'
import {
  ADMIN,
  AGENT_SARA,
  USERS,
  nextAttachmentId,
  nextMessageId,
  seedComplaints,
  type MockComplaint,
} from './data'

/**
 * Typed in-browser mock of the work-package-2 API.
 *
 * It exists so the UI can be built, demonstrated and screenshotted before the
 * Django service lands. It is compiled out of the production bundle: it is only
 * imported when VITE_MOCK is set at build time, and it additionally requires an
 * explicit opt-in at runtime.
 *
 * It enforces the same isolation rule as the backend (an agent only ever sees
 * their own complaints, and never an internal note) so the UI is never built
 * against a more permissive contract than production.
 */

export type Scenario = 'normal' | 'empty' | 'error' | 'error-list' | 'slow' | 'expired'

interface MockState {
  role: Role
  me: ApiUser
  scenario: Scenario
  complaints: MockComplaint[]
}

const listeners = new Set<(event: ServerEvent) => void>()

function query(): URLSearchParams {
  return new URLSearchParams(window.location.search)
}

const params = query()
const role: Role = params.get('role') === 'agent' ? 'agent' : 'admin'
const scenario = (params.get('scenario') as Scenario | null) ?? 'normal'
/** `?failSend=1` rejects outbound messages, to exercise the failed-bubble path. */
const failSend = params.get('failSend') === '1'
/** `?incoming=N` pushes an inbound message every N seconds over the mock stream. */
const incomingEvery = Number(params.get('incoming') ?? '0')

const state: MockState = {
  role,
  me: role === 'admin' ? ADMIN : { ...AGENT_SARA, role: 'agent' },
  scenario,
  complaints: scenario === 'empty' ? [] : seedComplaints(),
}

/** `?latency=<ms>` overrides the simulated round trip, for demoing skeletons. */
const LATENCY_OVERRIDE = Number(params.get('latency') ?? NaN)

function delay<T>(
  value: T,
  ms = Number.isFinite(LATENCY_OVERRIDE) ? LATENCY_OVERRIDE : state.scenario === 'slow' ? 1400 : 240,
): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function visible(complaint: MockComplaint): boolean {
  return state.role === 'admin' || complaint.author.bitrix_id === state.me.bitrix_id
}

function stripInternal(messages: Message[]): Message[] {
  return state.role === 'admin' ? messages : messages.filter((m) => !m.is_internal)
}

function summary(complaint: MockComplaint): ComplaintSummary {
  const visibleMessages = stripInternal(complaint.messages)
  const last = [...visibleMessages].reverse().find((m) => m.kind === 'user')
  return {
    id: complaint.id,
    ticket_no: complaint.ticket_no,
    subject: complaint.subject,
    status: complaint.status,
    priority: complaint.priority,
    author: complaint.author,
    assigned_to: complaint.assigned_to,
    created_at: complaint.created_at,
    updated_at: complaint.updated_at,
    resolved_at: complaint.resolved_at,
    last_message_at: complaint.last_message_at,
    last_message_preview: last?.body ?? null,
    unread_count: complaint.unread_count,
  }
}

function publish(event: ServerEvent): void {
  listeners.forEach((listener) => listener(event))
}

function find(id: number): MockComplaint | undefined {
  const complaint = state.complaints.find((c) => c.id === id)
  return complaint && visible(complaint) ? complaint : undefined
}

// --- route handlers -------------------------------------------------------

function handleList(url: URL): Response {
  const status = url.searchParams.get('status')
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
  const assignedTo = url.searchParams.get('assigned_to')
  const author = url.searchParams.get('author')

  let rows = state.complaints.filter(visible)
  if (status) rows = rows.filter((c) => c.status === status)
  if (q) {
    rows = rows.filter(
      (c) =>
        c.subject.toLowerCase().includes(q) ||
        c.ticket_no.toLowerCase().includes(q) ||
        stripInternal(c.messages).some((m) => m.body.toLowerCase().includes(q)),
    )
  }
  if (assignedTo === 'unassigned') rows = rows.filter((c) => c.assigned_to === null)
  else if (assignedTo) rows = rows.filter((c) => String(c.assigned_to?.bitrix_id) === assignedTo)
  if (author) rows = rows.filter((c) => String(c.author.bitrix_id) === author)

  const results = rows
    .map(summary)
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))

  return json({ results, count: results.length, next: null, previous: null, role: state.role })
}

function handleStats(): Response {
  const rows = state.complaints.filter(visible)
  const by_status: Record<Status, number> = {
    open: 0,
    in_progress: 0,
    on_hold: 0,
    resolved: 0,
    rejected: 0,
  }
  rows.forEach((c) => {
    by_status[c.status] += 1
  })
  return json({ total: rows.length, by_status, role: state.role })
}

function handleCreateComplaint(payload: CreateComplaintPayload): Response {
  const id = Math.max(0, ...state.complaints.map((c) => c.id)) + 1
  const ticket = `CMP-${String(153 + id).padStart(6, '0')}`
  const createdAt = new Date().toISOString()
  const first: Message = {
    id: nextMessageId(),
    complaint_id: id,
    kind: 'user',
    body: payload.body,
    is_internal: false,
    sender: state.me,
    attachments: payload.attachment_ids.map(mockAttachment),
    created_at: createdAt,
    read_by_counterpart: false,
  }
  const complaint: MockComplaint = {
    id,
    ticket_no: ticket,
    subject: payload.subject,
    status: 'open',
    priority: payload.priority,
    author: state.me,
    assigned_to: null,
    created_at: createdAt,
    updated_at: createdAt,
    resolved_at: null,
    last_message_at: createdAt,
    last_message_preview: payload.body,
    unread_count: 0,
    description: payload.body,
    messages: [first],
  }
  state.complaints.push(complaint)
  publish({ type: 'complaint.created', complaint: summary(complaint) })
  return json(complaint, 201)
}

function handlePatch(complaint: MockComplaint, payload: PatchComplaintPayload): Response {
  if (state.role !== 'admin') return json({ detail: 'Not permitted' }, 403)
  if (payload.status && !payload.note?.trim()) {
    return json({ detail: 'A note is required when changing status.', note: ['This field is required.'] }, 400)
  }

  const previous = complaint.status
  if (payload.status) complaint.status = payload.status
  if (payload.priority) complaint.priority = payload.priority
  if (payload.assigned_to !== undefined) {
    complaint.assigned_to =
      payload.assigned_to === null
        ? null
        : USERS.find((u) => u.bitrix_id === payload.assigned_to) ?? null
  }
  complaint.updated_at = new Date().toISOString()

  if (payload.status && payload.status !== previous) {
    const system: Message = {
      id: nextMessageId(),
      complaint_id: complaint.id,
      kind: 'system',
      body: `Status changed to ${statusLabel(payload.status)} by ${state.me.name} — reason: ${payload.note?.trim()}`,
      is_internal: false,
      sender: null,
      attachments: [],
      created_at: complaint.updated_at,
    }
    complaint.messages.push(system)
    complaint.last_message_at = system.created_at
    complaint.resolved_at = payload.status === 'resolved' ? system.created_at : null
    publish({ type: 'message.created', complaint_id: complaint.id, message: system })
  }

  publish({ type: 'complaint.updated', complaint: summary(complaint) })
  return json(complaint)
}

function mockAttachment(id: string): Attachment {
  return {
    id,
    original_name: uploadedNames.get(id) ?? 'attachment',
    mime: uploadedMimes.get(id) ?? 'application/octet-stream',
    size_bytes: uploadedSizes.get(id) ?? 0,
    width: null,
    height: null,
    duration: null,
    url: '#mock-download',
    thumbnail_url: uploadedPreviews.get(id) ?? null,
  }
}

function handleCreateMessage(complaint: MockComplaint, payload: CreateMessagePayload): Response {
  if (payload.is_internal && state.role !== 'admin') return json({ detail: 'Not permitted' }, 403)
  if (failSend) return json({ detail: 'Simulated send failure' }, 503)
  const message: Message = {
    id: nextMessageId(),
    complaint_id: complaint.id,
    kind: 'user',
    body: payload.body,
    is_internal: payload.is_internal,
    sender: state.me,
    attachments: payload.attachment_ids.map(mockAttachment),
    created_at: new Date().toISOString(),
    read_by_counterpart: false,
  }
  complaint.messages.push(message)
  complaint.last_message_at = message.created_at
  complaint.updated_at = message.created_at
  publish({ type: 'message.created', complaint_id: complaint.id, message })
  publish({ type: 'complaint.updated', complaint: summary(complaint) })
  return json(message, 201)
}

// --- upload endpoints -----------------------------------------------------

const uploadNames = new Map<string, string>()
const uploadMimes = new Map<string, string>()
const uploadSizes = new Map<string, number>()
const uploadedNames = new Map<string, string>()
const uploadedMimes = new Map<string, string>()
const uploadedSizes = new Map<string, number>()
const uploadedPreviews = new Map<string, string | null>()

let chunkFailuresInjected = 0

async function handleUploadChunk(uploadId: string, index: number, request: Request): Promise<Response> {
  // Read the body so the timing of the mock resembles a real transfer.
  const buffer = await request.arrayBuffer()
  // Scenario hook: fail one chunk mid-flight so the retry/resume path can be
  // demonstrated in a browser without unplugging the network.
  if (state.scenario === 'error' && index === 2 && chunkFailuresInjected === 0) {
    chunkFailuresInjected += 1
    return json({ detail: 'Simulated network drop' }, 502)
  }
  const throughput = 40 * 1024 * 1024 // 40 MB/s, so a large file behaves realistically
  await delay(null, Math.max(60, (buffer.byteLength / throughput) * 1000))
  void uploadId
  return json({ received: buffer.byteLength })
}

// --- fetch interception ---------------------------------------------------

const API_PREFIX = '/api/v1'

export function installMockServer(): void {
  // Stand in for the token the Django handler injects, so the auth path taken in
  // development is the same one taken in production: read once from the
  // bootstrap payload, then sent as Authorization: Bearer.
  if (!window.__COMPLAINTS__ && scenario !== 'expired') {
    window.__COMPLAINTS__ = { token: 'mock.jwt.token', api_base: '/api/v1' }
  }

  const realFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input as RequestInfo, init)
    const url = new URL(request.url, window.location.origin)
    if (!url.pathname.startsWith(API_PREFIX)) return realFetch(input as RequestInfo, init)

    const path = url.pathname.slice(API_PREFIX.length)

    if (state.scenario === 'expired') return json({ detail: 'Token expired' }, 401)
    if (state.scenario === 'error' && !path.startsWith('/uploads')) {
      return delay(json({ detail: 'Upstream unavailable' }, 503))
    }
    // Only the data endpoints fail: /me still answers, so the failure lands in
    // the list and thread panes rather than taking the whole app down.
    if (state.scenario === 'error-list' && path !== '/me' && !path.startsWith('/uploads')) {
      return delay(json({ detail: 'Upstream unavailable' }, 503))
    }

    // /me
    if (path === '/me') {
      return delay(json({ user: state.me, role: state.role, server_time: new Date().toISOString() }))
    }

    if (path === '/stats') return delay(handleStats())

    if (path === '/users' && url.searchParams.get('role') === 'admin') {
      return delay(json({ results: [ADMIN], count: 1, next: null, previous: null, role: state.role }))
    }

    if (path === '/complaints' && request.method === 'GET') return delay(handleList(url))

    if (path === '/complaints' && request.method === 'POST') {
      const payload = (await request.json()) as CreateComplaintPayload
      return delay(handleCreateComplaint(payload))
    }

    const messagesMatch = /^\/complaints\/(\d+)\/messages$/.exec(path)
    if (messagesMatch) {
      const complaint = find(Number(messagesMatch[1]))
      if (!complaint) return delay(json({ detail: 'Not found' }, 404))
      if (request.method === 'POST') {
        const payload = (await request.json()) as CreateMessagePayload
        return delay(handleCreateMessage(complaint, payload))
      }
      const results = stripInternal(complaint.messages)
      return delay(
        json({ results, count: results.length, next: null, previous: null, role: state.role }),
      )
    }

    const readMatch = /^\/complaints\/(\d+)\/read$/.exec(path)
    if (readMatch) {
      const complaint = find(Number(readMatch[1]))
      if (!complaint) return delay(json({ detail: 'Not found' }, 404))
      complaint.unread_count = 0
      return delay(json({ ok: true }))
    }

    const detailMatch = /^\/complaints\/(\d+)$/.exec(path)
    if (detailMatch) {
      const complaint = find(Number(detailMatch[1]))
      // 404 rather than 403, exactly like the backend, so ids do not leak.
      if (!complaint) return delay(json({ detail: 'Not found' }, 404))
      if (request.method === 'PATCH') {
        const payload = (await request.json()) as PatchComplaintPayload
        return delay(handlePatch(complaint, payload))
      }
      return delay(json(complaint))
    }

    if (path === '/uploads/init' && request.method === 'POST') {
      const body = (await request.json()) as { filename: string; mime: string; size_bytes: number }
      const uploadId = `up_${Math.random().toString(36).slice(2)}`
      uploadNames.set(uploadId, body.filename)
      uploadMimes.set(uploadId, body.mime)
      uploadSizes.set(uploadId, body.size_bytes)
      return delay(json({ upload_id: uploadId, chunk_size: 8 * 1024 * 1024 }))
    }

    const chunkMatch = /^\/uploads\/([^/]+)\/chunk\/(\d+)$/.exec(path)
    if (chunkMatch) {
      return handleUploadChunk(chunkMatch[1] as string, Number(chunkMatch[2]), request)
    }

    const completeMatch = /^\/uploads\/([^/]+)\/complete$/.exec(path)
    if (completeMatch) {
      const uploadId = completeMatch[1] as string
      const id = nextAttachmentId()
      uploadedNames.set(id, uploadNames.get(uploadId) ?? 'attachment')
      uploadedMimes.set(id, uploadMimes.get(uploadId) ?? 'application/octet-stream')
      uploadedSizes.set(id, uploadSizes.get(uploadId) ?? 0)
      uploadedPreviews.set(id, null)
      const attachment = mockAttachment(id)
      return delay(json({ attachment_id: id, attachment }))
    }

    return json({ detail: 'Not found' }, 404)
  }

  installMockEventSource()

  if (incomingEvery > 0) {
    const counterpart = state.role === 'admin' ? AGENT_SARA : ADMIN
    let n = 0
    window.setInterval(() => {
      const complaint = state.complaints.find(visible)
      if (!complaint) return
      n += 1
      const message: Message = {
        id: nextMessageId(),
        complaint_id: complaint.id,
        kind: 'user',
        body: `Update ${n}: the media team has re-uploaded another batch.`,
        is_internal: false,
        sender: counterpart,
        attachments: [],
        created_at: new Date().toISOString(),
        read_by_counterpart: false,
      }
      complaint.messages.push(message)
      complaint.last_message_at = message.created_at
      publish({ type: 'message.created', complaint_id: complaint.id, message })
      publish({ type: 'complaint.updated', complaint: summary(complaint) })
    }, incomingEvery * 1000)
  }
}

/**
 * Minimal EventSource stand-in so the realtime path (and its indicator) can be
 * exercised without the Django SSE endpoint.
 */
function installMockEventSource(): void {
  class MockEventSource extends EventTarget {
    onopen: ((this: EventSource, ev: Event) => unknown) | null = null
    onmessage: ((this: EventSource, ev: MessageEvent<string>) => unknown) | null = null
    onerror: ((this: EventSource, ev: Event) => unknown) | null = null
    readyState = 0
    readonly url: string
    readonly withCredentials = false
    private unsubscribe: (() => void) | null = null

    constructor(url: string) {
      super()
      this.url = url
      setTimeout(() => {
        this.readyState = 1
        this.onopen?.call(this as unknown as EventSource, new Event('open'))
        const listener = (event: ServerEvent) => {
          this.onmessage?.call(
            this as unknown as EventSource,
            new MessageEvent<string>('message', { data: JSON.stringify(event) }),
          )
        }
        listeners.add(listener)
        this.unsubscribe = () => listeners.delete(listener)
      }, 150)
    }

    close(): void {
      this.readyState = 2
      this.unsubscribe?.()
    }
  }

  Object.defineProperty(window, 'EventSource', {
    writable: true,
    configurable: true,
    value: MockEventSource as unknown as typeof EventSource,
  })
}
