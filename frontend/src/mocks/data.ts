import type {
  ApiUser,
  Attachment,
  Complaint,
  Message,
  Priority,
  Status,
} from '@/api/types'

/**
 * Seed data for the typed mock backend.
 *
 * The real API (work package 2) was still being built while this SPA was
 * written, so every screen is developed against this fixture. It follows the
 * contract in PROMPT-2-backend.md exactly; nothing here invents a field the
 * backend was not asked to return (in particular there is no category field).
 */

export const ADMIN: ApiUser = {
  bitrix_id: 1,
  name: 'Admin Abdul Malik',
  email: 'khurram162@gmail.com',
  avatar_url: null,
  role: 'admin',
}

export const AGENT_SARA: ApiUser = {
  bitrix_id: 27,
  name: 'Sara Haddad',
  email: 'sara@a7grouprealestatedxb.com',
  avatar_url: null,
  role: 'agent',
}

export const AGENT_OMAR: ApiUser = {
  bitrix_id: 34,
  name: 'Omar Farouq',
  email: 'omar@a7grouprealestatedxb.com',
  avatar_url: null,
  role: 'agent',
}

export const USERS: ApiUser[] = [ADMIN, AGENT_SARA, AGENT_OMAR]

function svgDataUrl(label: string, from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <text x="60" y="420" font-family="Segoe UI, sans-serif" font-size="64" fill="#ffffff">${label}</text>
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

let attachmentSeq = 100

function image(name: string, label: string, from: string, to: string, size: number): Attachment {
  attachmentSeq += 1
  const url = svgDataUrl(label, from, to)
  return {
    id: `att_${attachmentSeq}`,
    original_name: name,
    mime: 'image/png',
    size_bytes: size,
    width: 1200,
    height: 800,
    duration: null,
    url,
    thumbnail_url: url,
  }
}

function doc(name: string, mime: string, size: number): Attachment {
  attachmentSeq += 1
  return {
    id: `att_${attachmentSeq}`,
    original_name: name,
    mime,
    size_bytes: size,
    width: null,
    height: null,
    duration: null,
    url: '#mock-download',
    thumbnail_url: null,
  }
}

function video(name: string, size: number, duration: number): Attachment {
  attachmentSeq += 1
  return {
    id: `att_${attachmentSeq}`,
    original_name: name,
    mime: 'video/mp4',
    size_bytes: size,
    width: 1920,
    height: 1080,
    duration,
    url: '#mock-video',
    thumbnail_url: svgDataUrl('Site walkthrough', '#1f2731', '#41505f'),
  }
}

const now = Date.now()
const minutes = (n: number) => new Date(now - n * 60_000).toISOString()
const hours = (n: number) => new Date(now - n * 3_600_000).toISOString()
const days = (n: number) => new Date(now - n * 86_400_000).toISOString()

export interface MockComplaint extends Complaint {
  messages: Message[]
}

let messageSeq = 1000

function msg(
  complaintId: number,
  sender: ApiUser | null,
  body: string,
  createdAt: string,
  extra: Partial<Message> = {},
): Message {
  messageSeq += 1
  return {
    id: messageSeq,
    complaint_id: complaintId,
    kind: 'user',
    body,
    is_internal: false,
    sender,
    attachments: [],
    created_at: createdAt,
    read_by_counterpart: true,
    ...extra,
  }
}

function complaint(
  id: number,
  ticket: string,
  subject: string,
  author: ApiUser,
  status: Status,
  priority: Priority,
  description: string,
  messages: Message[],
  assigned: ApiUser | null,
  unread: number,
): MockComplaint {
  const last = messages[messages.length - 1]
  const lastVisible = [...messages].reverse().find((m) => m.kind === 'user')
  return {
    id,
    ticket_no: ticket,
    subject,
    status,
    priority,
    author,
    assigned_to: assigned,
    created_at: messages[0]?.created_at ?? days(4),
    updated_at: last?.created_at ?? days(4),
    resolved_at: status === 'resolved' ? last?.created_at ?? null : null,
    last_message_at: last?.created_at ?? days(4),
    last_message_preview: lastVisible?.body ?? null,
    unread_count: unread,
    description,
    messages,
  }
}

export function seedComplaints(): MockComplaint[] {
  const c1Messages: Message[] = [
    msg(
      1,
      AGENT_SARA,
      'The Damac Hills 2 listing photos were replaced with the wrong unit. Client viewing is on Thursday and the portal is showing a different layout.',
      days(2),
      { attachments: [image('listing-wrong.png', 'Wrong unit photo', '#2563eb', '#15788a', 1_842_112)] },
    ),
    {
      ...msg(1, null, 'Status changed to In Progress by Admin Abdul Malik — reason: reassigned to the media team', days(2)),
      kind: 'system',
    },
    msg(1, ADMIN, 'Thanks Sara, I can see it. Media are re-exporting the correct set now.', hours(30)),
    msg(1, AGENT_SARA, 'Perfect. The client asked specifically for the corner unit balcony shot.', hours(29)),
    msg(1, ADMIN, 'Noted. New set is uploading, should be live within the hour.', minutes(52), {
      attachments: [
        image('corrected-set.png', 'Corrected set', '#15786c', '#3fb3a0', 2_190_338),
        doc('unit-plan-4b.pdf', 'application/pdf', 4_402_119),
      ],
    }),
    msg(1, AGENT_SARA, 'That looks right, thank you.', minutes(12), { read_by_counterpart: false }),
  ]

  const c2Messages: Message[] = [
    msg(
      2,
      AGENT_SARA,
      'Commission for the Marina Vista deal has not appeared in my statement for two cycles.',
      days(9),
    ),
    {
      ...msg(2, null, 'Status changed to On Hold by Admin Abdul Malik — reason: waiting on finance reconciliation', days(8)),
      kind: 'system',
    },
    msg(2, ADMIN, 'Finance are reconciling the October batch. I will come back to you by Sunday.', days(8)),
  ]

  const c3Messages: Message[] = [
    msg(3, AGENT_OMAR, 'CRM is logging me out every few minutes on the Dubai Hills pipeline view.', days(5)),
    msg(3, ADMIN, 'Can you record the screen next time it happens?', days(5)),
    msg(3, AGENT_OMAR, 'Recorded a full walkthrough of the session dropping out.', days(4), {
      attachments: [video('session-drop.mp4', 1_820_004_991, 214)],
    }),
    {
      ...msg(3, null, 'Status changed to Resolved by Admin Abdul Malik — reason: session timeout raised to 8 hours', days(3)),
      kind: 'system',
    },
  ]

  const c4Messages: Message[] = [
    msg(4, AGENT_OMAR, 'Requesting a second monitor for the Business Bay desk.', days(14)),
    {
      ...msg(4, null, 'Status changed to Rejected by Admin Abdul Malik — reason: hardware budget frozen until Q1', days(13)),
      kind: 'system',
    },
  ]

  const c5Messages: Message[] = [
    msg(
      5,
      AGENT_SARA,
      'The lead router assigned three Palm Jumeirah enquiries to an agent who is on leave.',
      hours(4),
    ),
    {
      ...msg(
        5,
        ADMIN,
        'Internal: check the absence calendar sync before replying — this is the second time this week.',
        hours(3),
      ),
      is_internal: true,
    },
  ]

  const c6Messages: Message[] = [
    msg(6, AGENT_OMAR, 'Portal export to Bayut is failing with a validation error on plot size.', minutes(140), {
      attachments: [doc('bayut-error.log', 'text/plain', 18_221)],
    }),
  ]

  return [
    complaint(1, 'CMP-000142', 'Wrong listing photos on Damac Hills 2', AGENT_SARA, 'in_progress', 'high', c1Messages[0]?.body ?? '', c1Messages, ADMIN, 0),
    complaint(2, 'CMP-000138', 'Missing commission on Marina Vista deal', AGENT_SARA, 'on_hold', 'urgent', c2Messages[0]?.body ?? '', c2Messages, ADMIN, 1),
    complaint(3, 'CMP-000131', 'CRM session drops during pipeline work', AGENT_OMAR, 'resolved', 'normal', c3Messages[0]?.body ?? '', c3Messages, ADMIN, 0),
    complaint(4, 'CMP-000119', 'Second monitor request, Business Bay desk', AGENT_OMAR, 'rejected', 'low', c4Messages[0]?.body ?? '', c4Messages, null, 0),
    complaint(5, 'CMP-000151', 'Leads routed to an agent on leave', AGENT_SARA, 'open', 'high', c5Messages[0]?.body ?? '', c5Messages, null, 2),
    complaint(6, 'CMP-000153', 'Bayut export failing on plot size', AGENT_OMAR, 'open', 'normal', c6Messages[0]?.body ?? '', c6Messages, null, 1),
  ]
}

export const nextMessageId = (): number => {
  messageSeq += 1
  return messageSeq
}

export const nextAttachmentId = (): string => {
  attachmentSeq += 1
  return `att_${attachmentSeq}`
}
