# A7 Complaints — frontend (work package 3)

React 18 + Vite + TypeScript + Tailwind + TanStack Query. Builds to static assets that nginx
serves on `complaints.srv1802669.hstgr.cloud`; `/api/` and `/bitrix/` are proxied to the Django
container by work package 1.

## Commands

```bash
npm install
npm run dev        # http://127.0.0.1:5273 with the in-browser mock API
npm run build      # typecheck + production build into ./dist
npm run test       # vitest, jsdom
npm run typecheck
```

## What work package 1 needs from this package

| Item | Value |
|---|---|
| Build command | `npm ci && npm run build` (repository root) |
| Build output | `dist/` — `index.html` plus `assets/` (hashed JS/CSS and one web worker) |
| Deploy target | `/opt/a7-complaints/web` (copy the contents of `dist/`), served by nginx as the site root |
| Routing | Single page, no client-side router. `/api/` and `/bitrix/` proxy to `127.0.0.1:8200`; everything else falls back to `index.html` |
| Caching | `assets/*` is content-hashed and may be cached immutably. `index.html` must never be cached |
| Extra headers | None required beyond the CSP `frame-ancestors` already specified. The app sets no cookies |

## What work package 2 needs to do in the bootstrap HTML

`/bitrix/handler/` should return the built `index.html` with the token injected **before** the
module script:

```html
<script>
  window.__COMPLAINTS__ = {
    token: "<the 12-hour JWT>",
    api_base: "/api/v1"        // optional, this is the default
  };
</script>
```

Two other injection shapes are accepted, whichever is easier server-side:

```html
<script id="complaints-bootstrap" type="application/json">{"token":"…"}</script>
<meta name="complaints-token" content="…">
```

The SPA reads the token once, keeps it in memory, mirrors it into `sessionStorage` (so a soft
reload of the iframe survives) and sends `Authorization: Bearer <token>` on every request.
No cookies are set or read. A `401` is terminal — the app shows a "reopen Complaints from the
CRM sidebar" screen rather than attempting a refresh, because there is no refresh flow inside
an iframe.

The bootstrap HTML should also include the portal's BX24 SDK script, exactly as Bitrix local
apps normally do. If it is present, the app calls `BX24.fitWindow()` on mount and, debounced, on
every layout change.

## Environment

Nothing secret belongs in a Vite bundle; everything here is public by construction.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE` | `/api/v1` | JSON API base path |
| `VITE_BITRIX_PORTAL` | unset | Only used in local development, to load the BX24 SDK. Leave unset in production — the bootstrap HTML already includes it |
| `VITE_MOCK` | unset | `1` installs the in-browser mock API. Set in `.env.development` only; never in a production build |

## Development mock

`npm run dev` runs against `src/mocks/` — a typed in-browser implementation of the work-package-2
contract, including the isolation rule (an agent gets `404`, never `403`, on another agent's
complaint) and internal-note stripping. It is dynamically imported behind `VITE_MOCK`, so it is
absent from `npm run build` output.

Query parameters, development only:

| Parameter | Values | Effect |
|---|---|---|
| `role` | `admin` (default), `agent` | Which identity the fake handler minted a token for |
| `scenario` | `normal`, `empty`, `error`, `slow`, `expired` | Drives the empty, error, loading and session-expired screens |
| `latency` | milliseconds | Overrides the simulated round trip, useful for looking at skeletons |

Examples: `http://127.0.0.1:5273/?role=agent`, `…/?scenario=empty`, `…/?latency=9000`.

## Layout rules that are easy to break

- **Never use a `window` media query for layout.** The usable width is the CRM content area and
  it changes when the user collapses the Bitrix sidebar, with no window resize event. All
  breakpoints read a `ResizeObserver` on the app's own root (`useContainerWidth`). Two panes at
  ≥ 900 px of measured width, one pane with a back button below that.
- **Call `fitWindow()` after anything that changes document height**, debounced. It is already
  wired to mount, pane changes, message arrival and a `ResizeObserver` on `documentElement`.
- **Never touch `window.top`.**

## Structure

```
src/
  api/         typed client, query hooks, cache patching   (no `any` on the wire)
  components/  primitives, icons, modal, connection chip
  features/
    list/      stat strip, filter bar, complaint rows
    thread/    thread, bubbles, composer, header
    compose/   new-complaint modal
    attachments/ image, video, file cards, lightbox, upload tray
  hooks/       container width, realtime, uploads, debounce, reduced motion
  lib/         auth bootstrap, BX24 glue, formatting, status palette,
               chunked-upload manager, streaming SHA-256 (+ worker)
  mocks/       development-only fake backend
  test/        vitest suites
```

## Design system

One type scale, one spacing rhythm, one status palette, defined in `tailwind.config.js` and
`src/lib/status.ts`. The fixed status colours from `CONTEXT.md` (open = blue, in_progress =
amber, on_hold = slate, resolved = green, rejected = red) are used identically in the dot, pill,
chip and stat tile. Status is never communicated by colour alone: every colour surface is paired
with the status label, and each status also has its own glyph.
