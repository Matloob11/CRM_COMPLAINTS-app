# Requests to work package 2 (Django API)

The SPA is built against the contract in `PROMPT-2-backend.md`. Everything below is either a
field that contract does not mention but the UI needs, or a shape the UI has assumed. Each item
says what the UI does today if the field is missing, so nothing here blocks either side.

## 1. Message needs a `client_id` echo (optimistic send)

`POST /complaints/{id}/messages` is sent with a `client_id` string. Please echo it back on the
created message.

Without it the optimistic bubble is reconciled by removing the local pending entry when the POST
resolves, which is correct for a single tab but cannot dedupe a message that also arrives over
SSE in the same instant. Echoing `client_id` (and including it in the `message.created` SSE
payload) makes that dedupe exact.

**UI today:** works without it; a duplicate bubble is possible for a fraction of a second if SSE
delivers the caller's own message before the POST response.

## 2. Read state per message: `read_by_counterpart`

The thread renders WhatsApp-style delivery ticks: one tick = stored by the server, two ticks =
the counterpart has read up to this message. `ReadReceipt.last_read_message_id` already holds
what is needed; the UI needs it projected onto each message it renders, as a boolean
`read_by_counterpart`.

**UI today:** the field is optional in the types. When it is absent every delivered message shows
a single tick, which understates rather than overstates delivery.

## 3. Unread count and last-message preview on the list row

`ComplaintSummary` is expected to carry `unread_count` and `last_message_preview`. Both must be
computed **after** internal notes are filtered for the caller — otherwise an agent can infer the
existence and length of an admin note from the badge or the preview text, which is the same leak
the contract forbids in the thread.

## 4. Attachment metadata for previews

The UI uses `width`, `height`, `duration`, and — if you can produce it cheaply — a
`thumbnail_url` for images and a poster frame for video. The contract already lists the first
three.

`thumbnail_url` is optional in the types. If it is absent the UI falls back to the full
`/attachments/{id}` URL for images and to a neutral dark card for video, which costs bandwidth on
large images.

`url` on an attachment is expected to be the authorised download URL (`/api/v1/attachments/{id}`),
not a filesystem path.

## 5. Assignee directory endpoint

The admin assign control needs a list of assignable users. The UI calls
`GET /users?role=admin`, shaped like the other paginated responses. This endpoint is not in the
contract — if you expose it under a different path, say so and it is a one-line change here.

**UI today:** if the call fails, the assign dropdown shows only "Unassigned" plus whoever is
already assigned; nothing else breaks. Agents never call it.

## 6. SSE authorisation via query parameter

`EventSource` cannot set an `Authorization` header. The UI opens
`GET /api/v1/events?access_token=<jwt>`. Please accept the token from that query parameter for
this endpoint only, and keep it out of access logs.

## 7. Upload endpoints

- `POST /uploads/init` → `{ upload_id, chunk_size }`. The UI honours whatever `chunk_size` is
  returned and falls back to 8 MB if it is missing or zero.
- `PUT /uploads/{id}/chunk/{n}` is sent with `Content-Type: application/octet-stream` and a raw
  body. It is retried with exponential backoff on network failure and on 5xx; it is **not**
  retried on 401, 403, 413 or 422, which are treated as permanent.
- `POST /uploads/{id}/complete` is sent `{ checksum_sha256, size_bytes }`. The checksum is
  computed in the browser with a streaming SHA-256 in a worker, so a multi-gigabyte file is never
  held in memory.
- The response is expected to be `{ attachment_id, attachment }` — the full attachment object,
  so the composer can show the real thumbnail and size without a second round trip. If only
  `attachment_id` comes back, the bubble shows a generic file card until the thread refetches.

## 8. Status change validation

`PATCH /complaints/{id}` with a `status` and a blank `note` is rejected client-side already, but
the UI expects a `400` with a human-readable `detail` if it ever reaches the server, and renders
that string verbatim.

## 9. Ticket numbers

`ticket_no` is rendered as an opaque human-readable string (`CMP-000142`). No format is assumed
beyond it being short and stable.

## Assumptions the UI has made

- Every response includes the caller's effective `role`; the UI uses `/me` for this and treats
  everything else as convenience.
- List ordering is server-side by `last_message_at` descending. The UI re-sorts locally after a
  realtime patch but does not paginate beyond page 1 yet — pagination hooks exist but the current
  volume does not need them.
- `GET /complaints/{id}/messages` returns the whole thread in one page for the volumes involved
  here. If you add real pagination, the `after_id` parameter is already in the client.
- Timestamps are ISO-8601 UTC. They are rendered in `Asia/Dubai`.
