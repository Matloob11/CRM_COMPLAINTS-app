# Work Package 2 — Django Backend and API

Paste everything below the line into the agent.

---

Read `CONTEXT.md` in this folder before doing anything. It contains the verified server
inventory, the chosen architecture, and the authentication design. Do not re-derive any of it.

You own **work package 2 of 3**. Another agent provisions the servers, nginx, TLS, and the
Bitrix local-app registration; a third builds the React frontend. You build the Django
application that lives in `./backend` and is containerised as `complaints-web`.

Do not touch nginx, TLS, Docker Compose, or Bitrix portal configuration — those belong to
work package 1. Do not write React components — those belong to work package 3. Your
deliverable is the backend plus a written API contract the frontend can build against.

## Stack

Django 5, Django REST Framework, PostgreSQL 16, Redis 7, gunicorn. Python 3.12. Mirror the
project structure of the existing `a7wa` Django app on the Hostinger VPS
(`/opt/a7-wa/backend`) so the two are operationally interchangeable — inspect it first.

## Data model

```
AppUser
  bitrix_id (unique, indexed)   name   email   avatar_url
  role: agent | admin           is_active   last_seen_at   created_at

Complaint
  id   ticket_no (human-readable, e.g. CMP-000142, unique)
  author  -> AppUser            priority: low|normal|high|urgent
  subject                       status: open|in_progress|on_hold|resolved|rejected
  assigned_to -> AppUser (null) created_at  updated_at  resolved_at
  last_message_at (indexed — drives list ordering)

Message
  complaint -> Complaint        sender -> AppUser
  kind: user | system           body (text, may be empty when attachment-only)
  is_internal (bool)            created_at

Attachment
  message -> Message            original_name   stored_path   mime   size_bytes
  checksum_sha256               width/height/duration (nullable, for previews)

StatusEvent
  complaint -> Complaint        from_status   to_status
  changed_by -> AppUser         note          created_at

ReadReceipt
  complaint -> Complaint        user -> AppUser   last_read_message_id
```

Notes on intent:

- `last_message_at` is denormalised deliberately. The complaint list is the hottest query in
  the app and must not join-and-aggregate the message table on every request.
- Every status change writes **both** a `StatusEvent` row (audit trail) and a `kind=system`
  `Message` (so it appears inline in the thread, the way WhatsApp shows "you were added").
  Do this in one transaction.
- `is_internal` messages are admin-only notes. They must never leak to an agent through any
  endpoint, including search, counts, unread badges, and last-message previews.
- Ticket numbers come from a Postgres sequence, not from `count() + 1`.
- There is deliberately **no category field**. The owner rejected it. Do not add one, and do
  not introduce a substitute called department, type, or tag.
- `AppUser.name` is populated from the Bitrix `user.current` response and refreshed on every
  handler call. Never accept a display name from the client.

## Authentication

Implement exactly the flow specified in `CONTEXT.md`. Two endpoints owned by you:

- `POST /bitrix/install/` — called once when the local app is installed. Persist the portal
  `member_id` and acknowledge with the HTML that calls `BX24.installFinish()`.
- `POST /bitrix/handler/` — called on every iframe open. Bitrix POSTs `AUTH_ID`,
  `REFRESH_ID`, `AUTH_EXPIRES`, `member_id`, `DOMAIN`, `PLACEMENT`, `PLACEMENT_OPTIONS`.

Handler logic, in order, failing closed at every step:

1. Reject unless `member_id` equals the configured expected portal id.
2. Call `GET https://crm.a7grouprealestatedxb.com/rest/user.current.json?auth=<AUTH_ID>`
   server-side. Never trust any identity field from the POST body itself — `AUTH_ID` is the
   only thing that proves anything, and only because Bitrix validates it for you.
3. Upsert `AppUser` from the REST response.
4. Resolve role: `admin` if the Bitrix id is in `COMPLAINTS_ADMIN_BITRIX_IDS`, otherwise
   `agent`. That allowlist currently contains exactly one id: `1` ("Admin Abdul Malik",
   `khurram162@gmail.com`). Do not hardcode it — read it from the environment so a second
   admin needs no code change. Note that Bitrix id `43`, "Abdul Malik Mughal", is an
   `imconnector_*` WhatsApp contact record and must never be treated as an admin.
5. Mint an application JWT: `HS256`, 12-hour expiry, claims `sub` (bitrix_id), `role`,
   `name`, `iat`, `exp`, `jti`. Sign with the secret from the environment.
6. Return the SPA bootstrap HTML with the token injected into the page, plus a
   `<base>` tag and the `BX24` JS include.

Set no cookies. Enforce `Authorization: Bearer` on every `/api/` route through a custom DRF
authentication class. Log the failure reason on rejection, never the token.

## API

Prefix `/api/v1/`. JSON only. Every response includes the caller's effective role so the UI
never has to guess.

```
GET    /me
GET    /complaints?status=&q=&assigned_to=&page=      list, newest activity first
POST   /complaints                                    create (subject, priority, body)
GET    /complaints/{id}
PATCH  /complaints/{id}                               admin only: status, assigned_to, priority
GET    /complaints/{id}/messages?after_id=            thread, paginated
POST   /complaints/{id}/messages                      body + attachment_ids[] + is_internal
POST   /complaints/{id}/read                          mark read up to a message id
GET    /stats                                         counts by status, scoped to the caller
GET    /events                                        SSE stream
POST   /uploads/init                                  -> upload_id, chunk_size
PUT    /uploads/{upload_id}/chunk/{n}                 raw chunk body
POST   /uploads/{upload_id}/complete                  -> attachment_id
GET    /attachments/{id}                              authorised download via X-Accel-Redirect
```

### Authorisation rules, enforced in a single reusable queryset filter

- `agent`: only complaints where `author == self`. Cannot change status, cannot assign,
  cannot read or write internal notes, cannot see other agents in any dropdown.
- `admin`: everything, including internal notes and assignment.
- `PATCH` to `status` requires a non-empty `note`. Write the `StatusEvent` and the system
  `Message` in the same transaction.
- Attachment download re-checks complaint ownership. Do not rely on an unguessable path.

Write a test that asserts agent A gets `404` — not `403` — on agent B's complaint id,
message list, and attachments. `404` avoids leaking that the id exists.

## Uploads

The owner explicitly refused any size cap, so a single POST is not viable — one dropped
packet on a 2 GB upload loses the whole transfer.

Implement resumable chunked upload:

- `POST /uploads/init` takes filename, mime, total size; returns an `upload_id` and a chunk
  size of 8 MB. Chunks accumulate under a temp directory keyed by `upload_id`.
- `PUT .../chunk/{n}` accepts a raw body, is idempotent, and can be retried.
- `POST .../complete` verifies the received byte count and the client-supplied SHA-256,
  assembles the file into `/opt/a7-complaints/media/YYYY/MM/<uuid>/<sanitised-name>`, and
  returns an `attachment_id`.
- Reject path traversal in the filename. Store a sanitised name; keep the original for display.
- Reap incomplete uploads older than 24 hours in the worker.
- Detect image dimensions and video duration for the thumbnail UI. Do not transcode video —
  it would burn CPU that the WhatsApp stacks on this box need.

Because nginx is configured with `client_max_body_size 0` and request buffering off, do not
add a Django-level size limit that would contradict it.

## Realtime

`GET /events` is an SSE stream, authorised by the same bearer token, subscribing the caller to
their permitted Redis pub/sub channels. Publish on new message, status change, and assignment.
Include a heartbeat comment every 25 seconds so proxies do not close the connection. The
frontend falls back to 10-second polling, so the REST endpoints must remain sufficient on
their own — SSE is an enhancement, never a requirement for correctness.

## Notifications

Fire an outbound webhook to the existing n8n instance at
`https://n8n.srv1802669.hstgr.cloud` on: complaint created, status changed, admin replied.
Sign the payload with an HMAC secret from the environment. Make it fully non-blocking — a
webhook failure must never fail the user's request, and must never roll back the transaction
that created the message. Queue it in the worker with retries and a dead-letter log.

## Non-negotiables

- Secrets come from the environment only. Never from a committed file, never in a log line.
- `DEBUG=False` in production settings, `ALLOWED_HOSTS` pinned to the subdomain.
- Structured JSON logging to stdout so Docker captures it.
- Migrations are checked in and run non-interactively from `deploy.sh`.
- `pytest` suite covering: the isolation rule, the status-transition transaction, chunked
  upload assembly and resume, internal-note leakage, and JWT expiry.
- Django admin registered for all models, for emergency data repair.

## Report back

Deliver the OpenAPI schema and a short written API contract the frontend agent can build
against without reading your source. Call out every endpoint whose shape you changed from the
list above, and every test that does not pass, with its output.
