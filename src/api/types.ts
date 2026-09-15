/**
 * Typed API surface for the A7 Complaints backend (work package 2).
 *
 * These types mirror the contract in PROMPT-2-backend.md. Nothing on a network
 * boundary is typed as `any`; every response passes through one of the shapes
 * declared here. Where the backend contract was silent, the assumption is
 * recorded in docs/API-REQUESTS.md and modelled defensively (optional field).
 */

export type Role = 'agent' | 'admin'

export const STATUSES = ['open', 'in_progress', 'on_hold', 'resolved', 'rejected'] as const
export type Status = (typeof STATUSES)[number]

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type Priority = (typeof PRIORITIES)[number]

export type MessageKind = 'user' | 'system'

/** Delivery state of a message as rendered in the thread. */
export type DeliveryState = 'pending' | 'sent' | 'read' | 'failed'

export interface ApiUser {
  bitrix_id: number
  name: string
  email: string | null
  avatar_url: string | null
  role: Role
}

export interface Me {
  user: ApiUser
  role: Role
  server_time: string
}

export interface Attachment {
  id: string
  original_name: string
  mime: string
  size_bytes: number
  width: number | null
  height: number | null
  duration: number | null
  /** Authorised download URL (`/api/v1/attachments/{id}`). */
  url: string
  /** Optional poster/thumbnail URL for images and video, when the API supplies one. */
  thumbnail_url?: string | null
}

export interface Message {
  id: number
  complaint_id: number
  kind: MessageKind
  body: string
  is_internal: boolean
  sender: ApiUser | null
  attachments: Attachment[]
  created_at: string
  /** Server-reported read state; absent on older payloads. */
  read_by_counterpart?: boolean
}

export interface ComplaintSummary {
  id: number
  ticket_no: string
  subject: string
  status: Status
  priority: Priority
  author: ApiUser
  assigned_to: ApiUser | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  last_message_at: string
  last_message_preview: string | null
  unread_count: number
}

export interface Complaint extends ComplaintSummary {
  description: string
}

export interface Paginated<T> {
  results: T[]
  count: number
  next: string | null
  previous: string | null
  /** Effective role of the caller, echoed on every response by the backend. */
  role: Role
}

export interface StatsResponse {
  total: number
  by_status: Record<Status, number>
  role: Role
}

export interface CreateComplaintPayload {
  subject: string
  priority: Priority
  body: string
  attachment_ids: string[]
}

export interface CreateMessagePayload {
  body: string
  attachment_ids: string[]
  is_internal: boolean
  /** Echoed back by the server so an optimistic bubble can be reconciled. */
  client_id: string
}

export interface PatchComplaintPayload {
  status?: Status
  assigned_to?: number | null
  priority?: Priority
  /** Required by the backend whenever `status` changes. */
  note?: string
}

export interface UploadInitResponse {
  upload_id: string
  chunk_size: number
}

export interface UploadCompleteResponse {
  attachment_id: string
  attachment: Attachment
}

export type ServerEvent =
  | { type: 'message.created'; complaint_id: number; message: Message }
  | { type: 'complaint.updated'; complaint: ComplaintSummary }
  | { type: 'complaint.created'; complaint: ComplaintSummary }
  | { type: 'read.updated'; complaint_id: number; user_bitrix_id: number; last_read_message_id: number }

export interface ComplaintFilters {
  status: Status | 'all'
  q: string
  /** Admin-only. `unassigned` maps to the API's null-assignee filter. */
  assigned_to: number | 'unassigned' | 'all'
  /** Admin-only. */
  author: number | 'all'
}
