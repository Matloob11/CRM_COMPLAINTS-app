# Work Package 1 — Infrastructure and Bitrix24 Sidebar Integration

Paste everything below the line into the agent.

---

Read `CONTEXT.md` in this folder before doing anything. It contains the verified server
inventory, the chosen architecture, and the authentication design. Do not re-derive any of it.

You own **work package 1 of 3**. Another agent builds the Django backend, a third builds the
React frontend. Your job is to make the platform exist and to make the CRM sidebar entry work.
Do not write application business logic, models, or UI components — stop at the boundaries
described below.

## Scope

### 1. Provision the application host on Hostinger

SSH target: `ssh -i ~/.ssh/hostinger_codex root@187.127.123.235`

This box runs live production workloads (n8n, three WhatsApp stacks, an ERP). Treat every
existing container, nginx vhost, and systemd unit as untouchable. Add, never modify.

Create `/opt/a7-complaints` following the layout conventions already used by `/opt/a7-wa`
(inspect that directory first and match it — directory names, env-file placement, deploy
script style, backup script style).

Write a `docker-compose.yml` with four services:

| Service | Image | Binding |
|---|---|---|
| `complaints-web` | built from `./backend` | `127.0.0.1:8200 -> 8000` |
| `complaints-worker` | same image, background jobs | internal only |
| `complaints-postgres` | `postgres:16-alpine` | internal only, named volume |
| `complaints-redis` | `redis:7-alpine` | internal only |

Constraints:

- Never bind Postgres or Redis to `0.0.0.0`. Internal Docker network only.
- Use a dedicated Docker network so this stack cannot reach the a7wa or n8n containers.
- Env file at `/opt/a7-complaints/.env`, mode `0600`, owned by root. Generate the Postgres
  password and the application JWT signing secret with `openssl rand -hex 32`. Never print
  either value into logs, terminal transcripts, or documentation.
- Media lives on a bind mount at `/opt/a7-complaints/media`, not inside a container layer.
- Restart policy `unless-stopped` on every service.

The backend agent supplies `./backend`. Until it lands, stub it with a minimal Dockerfile and
a health endpoint so the stack can be brought up and proven end to end. Say clearly in your
handover which parts are stubs.

### 2. TLS and the nginx vhost

The subdomain `complaints.srv1802669.hstgr.cloud` already resolves to this VPS through the
existing wildcard — verify this with `dig` before assuming it, then issue a Let's Encrypt
certificate with the same certbot invocation pattern the box already uses for
`n8n.srv1802669.hstgr.cloud`. Confirm the renewal timer covers the new certificate.

Create `/etc/nginx/conf.d/a7-complaints.conf`. It must:

- Redirect port 80 to 443.
- Terminate TLS and reverse-proxy to `127.0.0.1:8200`.
- Serve the built frontend assets as static files, with `/api/` and `/bitrix/` proxied to the
  backend. The frontend agent will write to a build output directory — agree the path with
  them and document it.
- Set `client_max_body_size 0;` so uploads are unbounded, as the owner requires.
- Set `proxy_request_buffering off;` and generous `proxy_read_timeout` /
  `proxy_send_timeout` (3600s) so a multi-gigabyte video upload is streamed rather than
  buffered to disk twice and does not time out.
- Send `Content-Security-Policy: frame-ancestors https://crm.a7grouprealestatedxb.com;`
  as an `always` header.
- **Not** send `X-Frame-Options`. If any inherited config adds it, remove it for this vhost.
  `X-Frame-Options` has no origin allowlist and would block the CRM iframe outright.
- Add an `internal` location for protected media, served via `X-Accel-Redirect`, so the
  backend can authorise a download while nginx does the actual file streaming. Media files
  must never be reachable by guessing a URL.
- Reuse the existing `00-log-format-main.conf` log format.

Run `nginx -t` before every reload. A broken reload takes down n8n, the WhatsApp stacks, and
the ERP simultaneously.

### 3. Register the Bitrix24 local application

SSH target: `ssh a7-aws` (CentOS Stream 9, BitrixVM, passwordless sudo confirmed).

The portal is Bitrix24 **On-Premise** at `https://crm.a7grouprealestatedxb.com`, document root
`/home/bitrix/www`. The `rest` module is installed and `sitemanager.b_rest_app` already holds
19 registered applications, so this mechanism is known to work here.

Register a new local application through the portal UI
(Applications → Developer resources → Other → Local application):

- Handler path: `https://complaints.srv1802669.hstgr.cloud/bitrix/handler/`
- Initial installation path: `https://complaints.srv1802669.hstgr.cloud/bitrix/install/`
- Scope: `user`, `user_brief`, `placement`
- It needs a user interface, so do not tick the API-only option.

Capture the generated `client_id` and `client_secret`. Write them into
`/opt/a7-complaints/.env` on the Hostinger box over SSH. Do not paste them into this
repository, a commit message, or your final report.

Then bind the sidebar placement by calling `placement.bind` with:

```
PLACEMENT: LEFT_MENU
HANDLER:   https://complaints.srv1802669.hstgr.cloud/bitrix/handler/
TITLE:     Complaints
DESCRIPTION: Raise and track complaints
```

Verify with `placement.list` that the binding is registered.

**Fallback, only if `LEFT_MENU` is rejected by this on-premise build.** Do not silently skip
to a fallback — report which one you used and why:

1. Bind `LEFT_MENU_ITEM` if this build exposes it instead.
2. Otherwise add a global sidebar item from
   `/home/bitrix/www/local/php_interface/init.php` (prefer `local/` over
   `bitrix/php_interface/`, which is overwritten by portal updates), pointing at the
   installed application path. Back up any file you touch, with a dated suffix, before
   editing.

Whatever route you take, the item must be visible to **all** portal users, not only to the
administrator who installed it, and it must be labelled `Complaints`.

### 4. Prove the loop end to end

Deliver a working demonstration, not a claim:

- The stub backend echoes the POST fields Bitrix sends (`AUTH_ID`, `member_id`, `DOMAIN`,
  `PLACEMENT`) — with `AUTH_ID` redacted in any log output.
- Record the real `member_id` of this portal into `.env` as the expected value, so the
  backend agent can reject requests from any other portal.
- Confirm in a browser that clicking **Complaints** in the CRM sidebar renders the stub
  inside the iframe with no console errors. Explicitly check for CSP violations and
  mixed-content warnings.
- Verify a 1 GB test upload through nginx to the stub completes without a 413 or a timeout,
  then delete the test file.

### 5. Operations

- Nightly `pg_dump` to `/opt/a7-complaints/backups`, 14-day retention, matching the existing
  backup script style on the box.
- A disk-space alarm. Unlimited video uploads on 263 GB of free space is a real capacity
  risk — wire a check that warns at 80% and again at 90% root-filesystem usage, routed
  through the existing n8n instance at `https://n8n.srv1802669.hstgr.cloud`.
- A `deploy.sh` that pulls, builds, migrates, and restarts with no manual steps.
- A short `RUNBOOK.md`: how to deploy, read logs, restore a backup, and roll back.

## Definition of done

- `https://complaints.srv1802669.hstgr.cloud` serves over valid TLS with an A-grade config.
- The **Complaints** item is present in the CRM sidebar for every user and opens the iframe.
- Bitrix POST fields arrive at the handler and are readable by the backend.
- A 1 GB upload succeeds through the full nginx path.
- No existing container, vhost, or timer on either host has changed behaviour. Prove this by
  showing `docker ps` and `nginx -T` diffs from before and after.

## Report back

State plainly: what is live, what is stubbed, which placement route worked and which failed,
the exact contract the backend agent must implement at `/bitrix/handler/` and
`/bitrix/install/`, and the static-asset path the frontend agent must build into. Flag
anything you could not verify rather than assuming it works.
