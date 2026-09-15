# Deploy notes

Short, hard-won things about this deployment that are not obvious from the code.

## Replacing the frontend build: sync in place, do not `mv` the directory

`complaints-web` bind-mounts the built SPA read-only:

```
/opt/a7-complaints/panel  ->  /app/frontend-dist:ro
```

The Django Bitrix handler reads `/app/frontend-dist/index.html` and injects the
auth token into it, so the container needs the *current* build.

Docker resolves a bind mount to an inode when the container starts. Replacing
the host directory wholesale —

```sh
mv /opt/a7-complaints/panel /opt/a7-complaints/panel.prev
mv /opt/a7-complaints/panel.new /opt/a7-complaints/panel   # <-- breaks the mount
```

— leaves the running container mounted on the *old* directory. nginx serves the
new assets straight from the host path, but the handler keeps rendering the
previous `index.html`, which references asset filenames that no longer exist.
The result is a blank iframe with 404s in the console, and nothing in the
backend logs to explain it.

Either sync into the existing directory:

```sh
rsync -a --delete dist/ /opt/a7-complaints/panel/
chown -R 10001:10001 /opt/a7-complaints/panel
```

or, if the directory was replaced, restart the container so the mount is
re-established:

```sh
cd /opt/a7-complaints/deploy
docker compose --env-file /opt/a7-complaints/.env up -d --force-recreate complaints-web
```

Verify the container and the host agree before calling it done:

```sh
docker exec complaints-web grep -o 'assets/index-[A-Za-z0-9_-]*\.js' /app/frontend-dist/index.html
grep -o 'assets/index-[A-Za-z0-9_-]*\.js' /opt/a7-complaints/panel/index.html
```

## Volume ownership

The image runs as uid `10001`. Host directories mounted into it must be owned by
that uid or the container fails on startup at `collectstatic`:

```sh
chown -R 10001:10001 /opt/a7-complaints/media /opt/a7-complaints/static /opt/a7-complaints/panel
```

## Migrations live in the image, not the mount

`entrypoint.sh` runs `migrate` from the code baked into the image. Generating a
migration against the host source directory is not enough — rebuild before
restarting, or the container reports "no migrations to apply" while still
warning that the models have unapplied changes.

## Backups taken before the backend replaced the stub

| Path | What it is |
|---|---|
| `/opt/a7-complaints/backend.stub-backup` | The work-package-1 stub backend |
| `/opt/a7-complaints/panel.placeholder-backup` | The original placeholder page |
| `/opt/a7-complaints/panel.prev` | The build before the liquid-glass redesign |
| `/opt/a7-complaints/.env.bak-before-backend` | Env file before `DJANGO_SECRET_KEY` was added |
| `/opt/a7-complaints/deploy/docker-compose.yml.bak-before-backend` | Compose before the worker ran Celery |
| `/etc/nginx/conf.d/a7-complaints.conf.bak-before-timeouts` | nginx before the `/api/` timeout raise |

## Bitrix sidebar entry

The `Complaints` item is row `393` in `sitemanager.b_rest_placement` on the CRM
host (`ssh a7-aws`), bound to app id `79` with placement `LEFT_MENU`.

It was inserted directly rather than through `placement.bind`, because the
backend's install endpoint did not exist yet. The install handler now calls
`placement.bind` itself and treats "already exists" as success — but if the app
is ever reinstalled and a second row appears, the sidebar will show two
`Complaints` entries and one must be deleted by hand.
