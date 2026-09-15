import { clearToken, getApiBase, getToken } from '@/lib/auth'
import type {
  Complaint,
  ComplaintSummary,
  CreateComplaintPayload,
  CreateMessagePayload,
  Me,
  Message,
  Paginated,
  PatchComplaintPayload,
  StatsResponse,
  Status,
  UploadCompleteResponse,
  UploadInitResponse,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }

  /** The iframe has no refresh flow, so 401 is terminal for the session. */
  get isSessionExpired(): boolean {
    return this.status === 401
  }
}

/** Fired on 401 so the shell can swap in the "reopen from the CRM" screen. */
export const SESSION_EXPIRED_EVENT = 'a7c:session-expired'

function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return headers
}

async function parseError(res: Response): Promise<ApiError> {
  let detail: unknown = null
  let message = `${res.status} ${res.statusText}`
  try {
    const text = await res.text()
    if (text) {
      try {
        detail = JSON.parse(text) as unknown
        const asRecord = detail as Record<string, unknown>
        if (typeof asRecord?.detail === 'string') message = asRecord.detail
      } catch {
        detail = text
      }
    }
  } catch {
    /* body already consumed or network died mid-read */
  }
  return new ApiError(res.status, message, detail)
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: authHeaders(init.headers),
    // No cookies anywhere in this app, by design.
    credentials: 'omit',
  })

  if (res.status === 401) {
    clearToken()
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
    throw new ApiError(401, 'Session expired')
  }
  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export interface ListParams {
  status?: Status | 'all'
  q?: string
  assigned_to?: number | 'unassigned' | 'all'
  author?: number | 'all'
  page?: number
}

function listQuery(params: ListParams): string {
  const search = new URLSearchParams()
  if (params.status && params.status !== 'all') search.set('status', params.status)
  if (params.q) search.set('q', params.q)
  if (params.assigned_to !== undefined && params.assigned_to !== 'all') {
    search.set('assigned_to', String(params.assigned_to))
  }
  if (params.author !== undefined && params.author !== 'all') search.set('author', String(params.author))
  if (params.page && params.page > 1) search.set('page', String(params.page))
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export const api = {
  me: () => request<Me>('/me'),

  stats: () => request<StatsResponse>('/stats'),

  listComplaints: (params: ListParams) =>
    request<Paginated<ComplaintSummary>>(`/complaints${listQuery(params)}`),

  getComplaint: (id: number) => request<Complaint>(`/complaints/${id}`),

  createComplaint: (payload: CreateComplaintPayload) => post<Complaint>('/complaints', payload),

  patchComplaint: (id: number, payload: PatchComplaintPayload) =>
    request<Complaint>(`/complaints/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  listMessages: (id: number, afterId?: number) =>
    request<Paginated<Message>>(
      `/complaints/${id}/messages${afterId ? `?after_id=${afterId}` : ''}`,
    ),

  createMessage: (id: number, payload: CreateMessagePayload) =>
    post<Message>(`/complaints/${id}/messages`, payload),

  markRead: (id: number, lastReadMessageId: number) =>
    post<{ ok: true }>(`/complaints/${id}/read`, { last_read_message_id: lastReadMessageId }),

  /** Admin-only; agents never see an assignee dropdown and the API 403s them anyway. */
  listAdmins: () => request<Paginated<import('./types').ApiUser>>('/users?role=admin'),

  uploadInit: (body: { filename: string; mime: string; size_bytes: number }) =>
    post<UploadInitResponse>('/uploads/init', body),

  uploadChunk: (uploadId: string, index: number, chunk: Blob, signal: AbortSignal) =>
    request<{ received: number }>(`/uploads/${uploadId}/chunk/${index}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: chunk,
      signal,
    }),

  uploadComplete: (uploadId: string, body: { checksum_sha256: string; size_bytes: number }) =>
    post<UploadCompleteResponse>(`/uploads/${uploadId}/complete`, body),
}

/** SSE URL. EventSource cannot set headers, so the token rides as a query param. */
export function eventsUrl(): string {
  const token = getToken() ?? ''
  return `${getApiBase()}/events?access_token=${encodeURIComponent(token)}`
}
