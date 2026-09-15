# A7 Complaints

A complaint and ticketing system for **A7 Group Real Estate**, embedded inside the company Bitrix24 CRM as a left-sidebar iframe. Agents raise tickets; admins triage, reply, and resolve them. Complaint data and attachments live on the application host, not in the CRM database.

The product is designed to feel like a modern chat inbox: list on the left, WhatsApp-style thread on the right, live updates, and resumable uploads for large media.

---

## Why this exists

CRM users needed a dedicated **Complaints** entry in Bitrix24. Opening it must stay inside the CRM shell. Two roles only: **agent** and **admin**. An agent sees only their own tickets. An admin sees every ticket. Any portal user can raise a complaint. Attachments include images, video, PDF, and arbitrary documents, including multi-gigabyte files. Full history and status are always visible to the people allowed to see that ticket.

---

## Features

- **CRM-native access** — opened from the Bitrix24 left sidebar; no separate login screen
- **Two roles** — `agent` (own tickets only) and `admin` (all tickets)
- **Isolation at the API** — hiding UI is not enough; agents receive `404` for another agent’s ticket
- **Statuses** — `open`, `in_progress`, `on_hold`, `resolved`, `rejected`
- **Priorities** — `low`, `normal`, `high`, `urgent`
- **Threaded conversation** — user messages, system events, and admin-only internal notes
- **Resumable chunked uploads** — no application-level size cap; SHA-256 integrity on complete
- **Authorised media** — downloads go through the API; nginx serves bytes via `X-Accel-Redirect`
- **Realtime** — Server-Sent Events over Redis pub/sub, with a polling fallback
- **Dashboard** — counts and workload for admins; personal history for agents
- **No cookies** — short-lived application JWT in memory and `sessionStorage` of the iframe origin

There is **no category / department / tag field**. A complaint has a subject, a description, and a priority.

---

## Architecture

```
Bitrix24 On-Premise                         Application host
CRM left sidebar "Complaints"               HTTPS subdomain (TLS)
        |                                           |
        |  POST AUTH_ID, member_id, PLACEMENT       |
        +-------- iframe handler ------------------>+-- nginx
                                                    |     TLS, frame-ancestors,
                                                    |     unlimited body, media accel
                                                    |
                                                    +-- Django / Gunicorn  (127.0.0.1)
                                                    +-- Celery worker
                                                    +-- PostgreSQL 16
                                                    +-- Redis 7
                                                    +-- static SPA (Vite build)
                                                    +-- media on disk
```

The CRM is served over HTTPS. The app must also be HTTPS on a real hostname. A bare `http://IP:port` iframe is blocked as mixed content and cannot receive a public certificate.

### Authentication (no passwords)

1. Bitrix POSTs `AUTH_ID`, `REFRESH_ID`, `member_id`, `DOMAIN`, and `PLACEMENT` to `/bitrix/handler/`.
2. The backend calls Bitrix `user.current` with that `AUTH_ID` to prove the token and load identity.
3. `member_id` must match the expected portal. Anything else is rejected.
4. A local `AppUser` is upserted. Role comes from `COMPLAINTS_ADMIN_BITRIX_IDS`, never from the client.
5. The backend mints its **own** JWT (default 12 hours) and injects it into the SPA bootstrap HTML.
6. Every `/api/v1/` call sends `Authorization: Bearer <jwt>`.

Display names come from Bitrix `NAME` + `LAST_NAME` at handler time. The client cannot rename itself or grant itself a role.

### Isolation rule

Every list, retrieve, update, attachment, stats, and realtime path is filtered server-side:

- admin → all complaints
- agent → `author == current user` only

Internal notes (`is_internal`) are stripped from every agent-facing response, including previews and unread counts.

---

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Django 5, Django REST Framework, gunicorn + gevent, Celery |
| Database | PostgreSQL 16 |
| Cache / pub-sub | Redis 7 |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query |
| Realtime | SSE + Redis; 10-second polling fallback |
| Packaging | Docker image for the backend; static SPA copied to the host |
| Auth | Bitrix local-app handshake → application JWT (HS256) |
| API docs | OpenAPI via `drf-spectacular` at `/api/v1/schema` and `/api/v1/docs` |

---

## Repository layout

```
.
├── README.md                 ← this file
├── CONTEXT.md                ← product and infrastructure decisions
├── RUNBOOK.md                ← production operations
├── DEPLOY-NOTES.md           ← hard-won deploy pitfalls
├── PROMPT-1-infra-and-bitrix.md
├── PROMPT-2-backend.md
├── PROMPT-3-frontend.md
├── .env.example              ← host environment template (no secrets)
├── backend/                  ← Django project
│   ├── apps/
│   │   ├── accounts/         ← Bitrix handshake, JWT, users
│   │   ├── tickets/          ← complaints, messages, stats, isolation
│   │   ├── uploads/          ← resumable uploads and attachments
│   │   ├── realtime/         ← SSE
│   │   └── notifications/    ← outbound webhooks
│   ├── complaints/           ← settings, URLs, Celery
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                 ← React SPA
│   ├── src/
│   │   ├── api/              ← typed client and query hooks
│   │   ├── features/         ← list, thread, compose, attachments, dashboard
│   │   ├── lib/              ← auth bootstrap, BX24, uploads, status
│   │   └── mocks/            ← in-browser API for local UI work
│   └── docs/
└── screenshots/              ← UI reference captures
```

---

## Security and secrets

This repository is intended to hold **source and documentation only**.

**Do not commit:**

- `.env` or any filled environment file
- API keys, client secrets, webhook tokens, JWT signing keys
- SSH private keys, PEM files, cloud credential files
- Bitrix inbound webhook URLs (the path segment is a secret)
- Database passwords

Use `.env.example` and `backend/.env.example` as templates. On the server, the live file should be mode `0600` and owned by root.

The root `.gitignore` already excludes `.env`, key material, `node_modules`, build output, Django media, and large sample binaries.

If a secret was ever pasted into chat, a screenshot, or a previous archive, **rotate it** before relying on this repo as the source of truth.

---

## Prerequisites

**Frontend (UI only, mock API)**

- Node.js 20+
- npm

**Backend (full stack)**

- Python 3.12+
- PostgreSQL 16
- Redis 7
- FFmpeg (`ffprobe` is used for media metadata; nothing is transcoded)

**Production**

- Docker
- nginx with TLS and `frame-ancestors` limited to the CRM origin

---

## Local development

### Frontend with the mock API

The SPA can be designed and tested before Django is running. `frontend/.env.development` sets `VITE_MOCK=1`. That mock is dynamically imported and is **absent** from production builds.

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5273`.

| Query | Values | Effect |
|---|---|---|
| `role` | `admin` (default), `agent` | Identity the fake handler minted |
| `scenario` | `normal`, `empty`, `error`, `slow`, `expired` | Empty, error, loading, expired-session screens |
| `latency` | milliseconds | Simulated round trip |

Examples: `/?role=agent`, `/?scenario=empty`, `/?latency=9000`.

```bash
npm run test
npm run typecheck
npm run build
```

`npm run build` typechecks and writes hashed assets to `frontend/dist`.

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# Unix:    source .venv/bin/activate
pip install -r requirements-dev.txt
copy .env.example .env   # then edit; never copy a production .env
```

Provide a local PostgreSQL database and Redis matching `.env`, then:

```bash
python manage.py migrate
python manage.py runserver 8200
```

Health check (no auth): `GET /healthz`.

For production-shaped serving, the image entrypoint migrates only when the process is Gunicorn:

```bash
docker build -t a7-complaints-web backend
```

The container binds `0.0.0.0:8200` with gevent workers so SSE connections do not pin a sync worker.

---

## Environment variables

Names only. Values belong on the host, never in git.

| Variable | Purpose |
|---|---|
| `DJANGO_SECRET_KEY` | Django signing key; required when `DEBUG` is false |
| `DJANGO_DEBUG` | Development only |
| `DJANGO_ALLOWED_HOSTS` | Host header allowlist |
| `POSTGRES_*` | Database connection |
| `REDIS_URL` | Cache, Celery broker, SSE pub/sub |
| `BITRIX_PORTAL_URL` | On-premise CRM origin |
| `BITRIX_EXPECTED_MEMBER_ID` | Portal lock; handler rejects any other `member_id` |
| `BITRIX_CLIENT_ID` / `BITRIX_CLIENT_SECRET` | Local-app OAuth, if used |
| `COMPLAINTS_ADMIN_BITRIX_IDS` | Comma-separated Bitrix user ids that become admins |
| `COMPLAINTS_JWT_SECRET` | Signs the application JWT (not a Bitrix token) |
| `COMPLAINTS_JWT_TTL_HOURS` | Token lifetime (default 12) |
| `COMPLAINTS_MEDIA_ROOT` | Attachment storage |
| `COMPLAINTS_USE_X_ACCEL_REDIRECT` | `true` behind nginx; `false` in local Django |
| `COMPLAINTS_FRONTEND_DIST` | Built SPA the handler injects the token into |
| `COMPLAINTS_N8N_WEBHOOK_URL` / `_SECRET` | Optional outbound notifications |

Frontend Vite variables are public by construction (`VITE_API_BASE`, `VITE_BITRIX_PORTAL`, `VITE_MOCK`). Nothing secret belongs in a Vite bundle.

---

## HTTP API

All JSON routes sit under `/api/v1` and require `Authorization: Bearer <jwt>`, except `/healthz` and the Bitrix handler/install endpoints.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/healthz` | Container health |
| `POST` | `/bitrix/install/` | Local-app install; finishes with `BX24.installFinish()` |
| `POST` | `/bitrix/handler/` | Sidebar open; validates portal user; returns bootstrap HTML + JWT |
| `GET` | `/api/v1/me` | Current user and role |
| `GET` | `/api/v1/stats` | Dashboard counters (scoped by role) |
| `GET` | `/api/v1/users` | Directory for assignment (admin) |
| `GET`/`POST` | `/api/v1/complaints` | List / create |
| `GET`/`PATCH` | `/api/v1/complaints/:id` | Detail / status, assignment, fields |
| `GET`/`POST` | `/api/v1/complaints/:id/messages` | Thread |
| `POST` | `/api/v1/complaints/:id/read` | Mark read |
| `GET` | `/api/v1/events` | SSE stream |
| `POST` | `/api/v1/uploads/init` | Start resumable upload |
| `PUT` | `/api/v1/uploads/:id/chunk/:index` | Upload one chunk |
| `POST` | `/api/v1/uploads/:id/complete` | Assemble and checksum |
| `GET` | `/api/v1/attachments/:id` | Authorised download |
| `GET` | `/api/v1/schema` | OpenAPI schema |
| `GET` | `/api/v1/docs` | Swagger UI |

Ticket numbers are allocated from a PostgreSQL sequence (`CMP-000001`, …), not `COUNT(*) + 1`.

A machine-readable contract for the SPA also lives in `frontend/docs/API-REQUESTS.md`. Interactive schema is served by the backend when it is running.

---

## Uploads

The business rule is **no maximum file size**. A single POST of a multi-gigabyte video is not viable, so files are sent as 8 MiB chunks (configurable), resumed if the connection drops, and assembled on `complete`. Abandoned uploads are reaped after 24 hours.

Production nginx must use `client_max_body_size 0` and `proxy_request_buffering off`. Django does not materialise `request.body` for chunk traffic. Media is never world-readable: the API authorises, then nginx streams via `X-Accel-Redirect`.

---

## Frontend layout rules

These are easy to break and expensive to debug inside the CRM iframe:

1. **Do not use `window` media queries for layout.** Usable width is the CRM content pane and changes when the Bitrix sidebar collapses, often without a window resize. Breakpoints come from a `ResizeObserver` on the app root (`useContainerWidth`). Two panes at ≥ 900 px measured width; one pane plus a back button below that.
2. **Call `BX24.fitWindow()` after height changes**, already wired (debounced) to mount, pane changes, new messages, and document resize.
3. **Never touch `window.top`.**
4. A `401` is terminal. Show “reopen Complaints from the CRM sidebar”. There is no refresh flow inside the iframe.

---

## Status colours

Shared by API documentation and UI (`frontend/src/lib/status.ts`):

| Status | Colour |
|---|---|
| `open` | blue |
| `in_progress` | amber |
| `on_hold` | slate |
| `resolved` | green |
| `rejected` | red |

Status is never colour-only: every colour surface is paired with a label and a distinct glyph.

Timestamps are stored in UTC and rendered in `Asia/Dubai`.

---

## Testing

```bash
# Frontend
cd frontend
npm run test
npm run typecheck

# Backend (when a local database is configured)
cd backend
pytest
```

Frontend tests cover formatting, upload helpers, and component behaviour (Vitest + Testing Library + jsdom). Backend isolation — agent A must not read agent B’s ticket — is a required contract; implement and keep that case green as the suite grows.

---

## Deployment notes

Production install root on the application host is `/opt/a7-complaints`. The web container binds `127.0.0.1:8200`; nginx is the only public listener.

Critical operational facts (full detail in `RUNBOOK.md` and `DEPLOY-NOTES.md`):

- Sync the Vite build **into** the existing panel directory. Replacing the directory inode breaks the Docker bind mount and the handler keeps serving a stale `index.html`.
- The image runs as uid `10001`. Host mounts for media, static, and panel must be owned by that uid.
- Rebuild the image after generating migrations. `entrypoint.sh` migrates the code **inside** the image, not a host bind of `backend/`.
- Framing is allowed only via nginx `Content-Security-Policy: frame-ancestors <CRM origin>;`. Django’s `XFrameOptionsMiddleware` is intentionally absent (`X-Frame-Options: DENY` cannot allowlist one origin).

Do not restart or reconfigure unrelated services on the CRM host or the application host.

---

## Related documents

| File | Contents |
|---|---|
| [`CONTEXT.md`](CONTEXT.md) | Product rules, stack decisions, auth and isolation |
| [`RUNBOOK.md`](RUNBOOK.md) | Topology, backups, logs, handover contracts |
| [`DEPLOY-NOTES.md`](DEPLOY-NOTES.md) | Bind-mount, ownership, and iframe pitfalls |
| [`PROMPT-1-infra-and-bitrix.md`](PROMPT-1-infra-and-bitrix.md) | Infrastructure / Bitrix local-app work package |
| [`PROMPT-2-backend.md`](PROMPT-2-backend.md) | Backend API contract |
| [`PROMPT-3-frontend.md`](PROMPT-3-frontend.md) | Frontend work package |
| [`frontend/README.md`](frontend/README.md) | SPA commands and bootstrap contract |
| [`frontend/docs/API-REQUESTS.md`](frontend/docs/API-REQUESTS.md) | SPA-facing request shapes |

---

## License

Proprietary. Internal use for A7 Group Real Estate. Do not publish secrets, customer data, or recordings from this application.
