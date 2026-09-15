# A7 Complaints System — Shared Context

Read this file first. All three work-package prompts (`PROMPT-1`, `PROMPT-2`, `PROMPT-3`) depend on it.

## Goal

A complaint / ticketing application for A7 Group Real Estate. Any user of the company CRM
(Bitrix24) can raise a complaint. Admins triage and resolve them. The application is embedded
inside the CRM left sidebar as an iframe, so users never leave the CRM.

Hard requirements from the business owner:

1. New left-sidebar entry in the CRM labelled **Complaints** (does not exist today).
2. Clicking it opens the application inside an iframe within the CRM shell.
3. Roles are exactly two: `agent` and `admin`.
4. An agent sees **only their own** complaints. An admin sees **all** complaints.
5. Any CRM user may raise a complaint.
6. Attachments: images, video, PDF, and arbitrary documents. **No maximum upload size** —
   an agent may attach a multi-gigabyte video.
7. Full history is visible: how many complaints an agent has raised to date and the current
   status of each. Agents see their own history, admins see everyone's.
8. Status values, at minimum: in progress, resolved, rejected.
9. All complaint data and media are stored on the Hostinger VPS, never in the CRM database.
10. The chat/thread experience should feel like WhatsApp. UI/UX quality is a primary
    requirement, not an afterthought.

## Verified infrastructure

### CRM host — AWS EC2

| Item | Value |
|---|---|
| Public IP | `13.203.81.218` |
| Region | `ap-south-1` |
| OS | CentOS Stream 9 (BitrixVM appliance) |
| SSH | `ssh a7-aws` (alias already configured in `~/.ssh/config`), user `ec2-user`, passwordless `sudo` confirmed |
| Product | **Bitrix24 On-Premise** (self-hosted), `X-Powered-CMS: Bitrix Site Manager` |
| Portal URL | `https://crm.a7grouprealestatedxb.com` |
| Document root | `/home/bitrix/www` |
| PHP | 8.2.25 |
| Web server | nginx, vhosts in `/etc/nginx/bx/site_avaliable/` (`s1.conf`, `ssl.s1.conf`) |
| REST module | present at `/home/bitrix/www/bitrix/modules/rest` |
| Local-app table | `sitemanager.b_rest_app` — 19 apps already registered, so the local-app mechanism is proven on this portal |
| `init.php` | `/home/bitrix/www/bitrix/php_interface/init.php` exists |

Note: `/home/bitrix/www/bitrix/php_interface/` is not readable as `ec2-user`; use `sudo`.

### Application host — Hostinger VPS

| Item | Value |
|---|---|
| Public IP | `187.127.123.235` |
| Hostname | `srv1802669.hstgr.cloud` |
| OS | Ubuntu 24.04.4 LTS, KVM8 (8 vCPU / 32 GB RAM / 400 GB disk) |
| SSH | `ssh -i ~/.ssh/hostinger_codex root@187.127.123.235` |
| Disk free | 263 GB of 387 GB (32% used) |
| Web server | nginx on the host, vhosts in `/etc/nginx/conf.d/` (`sites-enabled` is empty) |
| Container runtime | Docker + Docker Compose v5.3.1 |
| TLS | certbot / Let's Encrypt already in use; live certs exist for `srv1802669.hstgr.cloud`, `n8n.srv1802669.hstgr.cloud`, `recordings.srv1802669.hstgr.cloud`, `sheikhmahboob.com` |
| DNS | `*.srv1802669.hstgr.cloud` already resolves to `187.127.123.235` — a new subdomain needs no DNS work |

Already running on this box (do not disturb any of it):

- `a7wa-web` / `a7wa-worker` / `a7wa-beat` — Django + gunicorn WhatsApp stack on `127.0.0.1:8100`
- `a7wa-postgres`, `wa-qr-postgres` — PostgreSQL 16
- `a7wa-redis`, `openwa-redis` — Redis 7
- `a7-n8n` (n8n 2.31.6) on `127.0.0.1:5678`, reachable at `https://n8n.srv1802669.hstgr.cloud`
- `openwa-api` on `127.0.0.1:2785`, `wa-qr-app` on `127.0.0.1:8300`
- host services on ports 3020, 3030, 8000, 8002, 8787
- nginx also listens on 80, 443, 2786, 8001, 8080, 8081, 8090

Ports `8200` and `8210` are confirmed free and are reserved for this project.

## Decided architecture

```
Bitrix24 On-Premise (AWS)                Hostinger VPS
crm.a7grouprealestatedxb.com             complaints.srv1802669.hstgr.cloud
                                          |
  [ Complaints ]  <-- left sidebar        +-- nginx (TLS, frame-ancestors, unlimited body)
        |                                 |
        +-- local app, LEFT_MENU  ------> +-- app container   127.0.0.1:8200
            placement, iframe             +-- postgres 16     (internal only)
                                          +-- redis 7         (internal only)
                                          +-- /opt/a7-complaints/media  (attachments on disk)
```

### Why a subdomain and not `IP:port`

The owner initially asked for plain `IP:port`. That cannot work, and the constraint is not
negotiable at the browser level:

- The CRM is served over HTTPS. A browser refuses to load an `http://187.127.123.235:8200`
  iframe inside an HTTPS page — this is mixed-content blocking, silent and unfixable from
  application code.
- A public certificate cannot be issued for a bare IP address by Let's Encrypt.

`complaints.srv1802669.hstgr.cloud` costs nothing, already resolves to the VPS, matches the
convention the box already uses for n8n and recordings, and gets a free Let's Encrypt
certificate. The container still binds to `127.0.0.1:8200`; nginx is the only public listener.

### Chosen stack

- **Backend** — Django 5 + Django REST Framework, gunicorn, PostgreSQL 16, Redis 7.
  Chosen because the VPS already runs exactly this stack for `a7wa`, so deployment,
  logging, backup, and operational habits carry over unchanged. Django admin also gives a
  free emergency data-repair console.
- **Frontend** — React 18 + Vite + TypeScript + Tailwind CSS, built to static assets and
  served by nginx. A single-page app is the right choice for a chat-style interface.
- **Realtime** — Server-Sent Events backed by Redis pub/sub, with a 10-second polling
  fallback. WebSockets are unnecessary for this traffic volume.
- **Packaging** — Docker Compose, mirroring the layout of `/opt/a7-wa`.
- **Install root** — `/opt/a7-complaints`, media under `/opt/a7-complaints/media`.

### Authentication — no passwords, no cookies

Bitrix local applications are, by design, iframes. When the user opens the app, Bitrix
POSTs to the registered handler URL with `AUTH_ID`, `REFRESH_ID`, `AUTH_EXPIRES`,
`member_id`, `DOMAIN`, `PLACEMENT`, and `PLACEMENT_OPTIONS`.

The flow is therefore:

1. Bitrix POSTs those fields to `https://complaints.srv1802669.hstgr.cloud/bitrix/handler/`.
2. The backend calls `GET https://crm.a7grouprealestatedxb.com/rest/user.current.json?auth=<AUTH_ID>`
   to prove the token is real and to learn the caller's identity.
3. `member_id` is compared against the one expected portal id; anything else is rejected.
4. The backend upserts a local `AppUser` keyed on the Bitrix user id and resolves the role.
5. The backend mints its **own** short-lived JWT and hands it to the SPA in the bootstrap HTML.
6. Every subsequent API call carries `Authorization: Bearer <jwt>`. The token lives in
   JavaScript memory plus `sessionStorage` of the iframe's own origin.

No session cookie is ever set. This deliberately sidesteps third-party-cookie blocking
in Chrome and Safari, which is the single most common reason cross-origin iframe apps break.

### Role resolution

`AppUser.role` is either `agent` or `admin`, defaulting to `agent`.

Admins are configured via the allowlist (`COMPLAINTS_ADMIN_BITRIX_IDS=1,2558`):
- Bitrix user id `1`: "Admin Abdul Malik" (`khurram162@gmail.com`)
- Bitrix user id `2558`: "khadija Munir" (`khadijafrom7g@gmail.com`)
Every other portal user is an `agent`.

Do not confuse this account with Bitrix user id `43`, "Abdul Malik Mughal" — that is an
`imconnector_*` WhatsApp contact record, not a real portal user. Only allowed IDs are admins.

Role is never trusted from the client.

### No categories

The owner explicitly does not want a category field. Do not add one, and do not add a
substitute such as "department", "type", or "tag". A complaint has a subject, a description,
and a priority. Nothing else classifies it.

### Author identity

The complaint author's display name is the Bitrix user's name, taken from the
`user.current` REST response (`NAME` + `LAST_NAME`) at handler time and refreshed on every
open. Never ask the user to type their own name, and never store a name the client supplied.

### Isolation rule

Every list, retrieve, update, and attachment-download query is filtered server-side by
`complaint.author_bitrix_id == request.user.bitrix_id` unless the caller's role is `admin`.
Hiding UI elements is not isolation. There must be a test proving that agent A receives
HTTP 404 for a complaint belonging to agent B.

## Conventions for all three work packages

- Never commit secrets. The existing `.env` in the project root holds Bitrix and 3CX
  credentials; reference variables by name only and never echo their values into logs,
  documentation, or commit messages.
- Nothing on either server may be restarted or reconfigured beyond what the work package
  explicitly authorises. Both machines run live production workloads.
- All timestamps are stored in UTC and rendered in `Asia/Dubai`.
- Status vocabulary is fixed: `open`, `in_progress`, `on_hold`, `resolved`, `rejected`.
- Status colours are fixed and shared by the API and the UI:
  open = blue, in_progress = amber, on_hold = slate, resolved = green, rejected = red.
