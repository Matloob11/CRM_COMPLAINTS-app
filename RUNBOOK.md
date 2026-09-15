# A7 Complaints System — Operations Runbook

This document details the operational procedures, architecture, maintenance commands, and integration contracts for the **A7 Complaints System**.

---

## 1. System Architecture & Topology

```
+-----------------------------------------------------------------------------------+
| Bitrix24 On-Premise (AWS EC2: 13.203.81.218)                                     |
| Portal URL: https://crm.a7grouprealestatedxb.com                                  |
| Left Sidebar Placement: "Complaints" (Placement ID: 393, App ID: 79)              |
| Handler POST Target: https://complaints.srv1802669.hstgr.cloud/bitrix/handler/   |
+-----------------------------------------------------------------------------------+
                                         |  (HTTPS / Iframe POST)
                                         v
+-----------------------------------------------------------------------------------+
| Application Host (Hostinger VPS: 187.127.123.235, Ubuntu 24.04)                   |
| Domain: https://complaints.srv1802669.hstgr.cloud                                 |
|                                                                                   |
|  +-- Host Nginx (VHost: /etc/nginx/conf.d/a7-complaints.conf)                     |
|  |   - TLS 1.2/1.3 ECDSA via Let's Encrypt (/etc/letsencrypt/live/a7-complaints/) |
|  |   - Frame Ancestors: https://crm.a7grouprealestatedxb.com                      |
|  |   - X-Frame-Options: OMITTED (allows CRM iframe embedding)                     |
|  |   - client_max_body_size: 0 (unlimited uploads)                               |
|  |   - proxy_request_buffering: off (streaming uploads)                           |
|  |   - Protected Media: /protected_media/ (via X-Accel-Redirect)                  |
|  |   - Static Frontend Path: /opt/a7-complaints/panel/                            |
|  |                                                                                |
|  +-- Docker Compose Stack (/opt/a7-complaints/deploy/docker-compose.yml)          |
|      - complaints-web:       127.0.0.1:8200 -> 8200 (Django / Gunicorn backend)   |
|      - complaints-worker:    Background jobs / Celery                             |
|      - complaints-postgres:  PostgreSQL 16-alpine (internal Docker network)       |
|      - complaints-redis:     Redis 7-alpine (internal Docker network)             |
|      - Network:              complaints_net (isolated)                            |
|      - Storage:              /opt/a7-complaints/media (bind-mounted)              |
+-----------------------------------------------------------------------------------+
```

---

## 2. Server Access & Locations

| Component | Host / Path |
|---|---|
| Hostinger VPS | `ssh -i ~/.ssh/hostinger_codex root@187.127.123.235` |
| AWS EC2 (Bitrix24) | `ssh a7-aws` (user: `ec2-user`, passwordless `sudo`) |
| App Root Directory | `/opt/a7-complaints` |
| Environment File | `/opt/a7-complaints/.env` (mode `0600`, root:root) |
| Compose File | `/opt/a7-complaints/deploy/docker-compose.yml` |
| Nginx VHost | `/etc/nginx/conf.d/a7-complaints.conf` |
| Media Storage | `/opt/a7-complaints/media` |
| Static Frontend Files | `/opt/a7-complaints/panel` |
| Backups Directory | `/opt/a7-complaints/backups` |
| Operations Scripts | `/opt/a7-complaints/ops/` |
| Cron Schedule | `/etc/cron.d/a7-complaints-ops` |

---

## 3. Daily Operations & Maintenance

### 3.1 Inspecting Service Status
```bash
cd /opt/a7-complaints/deploy
docker compose ps
```

### 3.2 Reading Application Logs
```bash
# Web application logs
docker compose logs -f complaints-web

# Worker logs
docker compose logs -f complaints-worker

# Database logs
docker compose logs -f complaints-postgres

# Nginx access & error logs
tail -f /var/log/nginx/a7-complaints.access.log
tail -f /var/log/nginx/a7-complaints.error.log
```

### 3.3 Deploying Updates (`deploy.sh`)
To deploy latest backend or infrastructure updates:
```bash
/opt/a7-complaints/deploy.sh
```
This script:
1. Rebuilds Docker container images.
2. Re-creates updated containers with zero downtime.
3. Automatically runs Django database migrations if `manage.py` is present.
4. Collects static assets.
5. Verifies health status via `http://127.0.0.1:8200/healthz`.

---

## 4. Backups and Disaster Recovery

### 4.1 Automated Backup Schedule
- **Database (`pg_dump`)**: Nightly at 22:30 UTC (02:30 Dubai time), compressed with gzip `-9`, stored in `/opt/a7-complaints/backups/db-YYYYMMDD-HHMM.sql.gz`.
- **Retention**: 14 days automatically cleaned up.
- **Media Archives**: Weekly on Mondays (`media-YYYYMMDD-HHMM.tar.gz`), 8 weeks retention.

### 4.2 Manual Backup Trigger
```bash
/opt/a7-complaints/ops/backup.sh
```

### 4.3 Restoring from Database Backup
To restore a database dump:
```bash
cd /opt/a7-complaints/deploy
set -a; . /opt/a7-complaints/.env; set +a

# Choose backup file:
BACKUP_FILE="/opt/a7-complaints/backups/db-YYYYMMDD-HHMM.sql.gz"

# Restore database
gunzip -c "$BACKUP_FILE" | docker compose exec -T complaints-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

---

## 5. Capacity Monitoring & Disk Alarms

- The Hostinger VPS runs hourly disk usage checks via `/opt/a7-complaints/ops/disk_alert.sh`.
- If root filesystem usage reaches **80%**, a `WARNING` webhook payload is sent to n8n (`https://n8n.srv1802669.hstgr.cloud/webhook/a7-infra-alerts`).
- If root filesystem usage reaches **90%**, a `CRITICAL` webhook payload is triggered.

---

## 6. Handover Contracts for Backend & Frontend Agents

### 6.1 Backend Agent Contract (Work Package 2)
1. **Container & Ports**:
   - The backend lives in `/opt/a7-complaints/backend`.
   - Binds to container port `8200` (or `8000` mapped to host `127.0.0.1:8200`).
2. **Environment Variables**:
   - Reads database credentials from `DATABASE_URL` or `POSTGRES_*`.
   - Reads `REDIS_URL` for pub/sub and caching.
   - Reads `BITRIX_PORTAL_MEMBER_ID` (verified: `f763e0122b6cc00b6fa31296894509b1`).
   - Reads `COMPLAINTS_ADMIN_BITRIX_IDS` (configured for admins: `1` for Admin Abdul Malik, `2558` for khadija Munir).
   - Reads `APP_JWT_SECRET` for signing application JWTs.
3. **Required Endpoints**:
   - `POST /bitrix/install/`: Called on app install, returns HTML calling `BX24.installFinish()`.
   - `POST /bitrix/handler/`: Called on every sidebar click with `AUTH_ID`, `member_id`, `DOMAIN`, `PLACEMENT`. Validates `member_id`, fetches `user.current` via Bitrix REST API, mints 12-hour JWT, and returns bootstrap HTML with the token.
   - `GET /healthz`: Returns HTTP 200 JSON status.
   - `GET /protected_media/<path>`: Validates user permissions for the attachment, then returns `X-Accel-Redirect: /protected_media/<path>`.
4. **No Cookies**: Use `Authorization: Bearer <jwt>` exclusively.

### 6.2 Frontend Agent Contract (Work Package 3)
1. **Build Output Directory**:
   - Build static assets into `/opt/a7-complaints/panel/`.
   - Entry file: `/opt/a7-complaints/panel/index.html`.
   - Static JS/CSS assets: `/opt/a7-complaints/panel/assets/`.
2. **Iframe Integration Rules**:
   - Call `BX24.fitWindow()` on mount and on document height changes (debounced).
   - Never use `window.top.location` or attempt parent navigation.
   - Use container `ResizeObserver` for layout breakpoints (CRM sidebar steals width).
   - Read bootstrap auth token from page / `sessionStorage` and send `Authorization: Bearer <jwt>`.
