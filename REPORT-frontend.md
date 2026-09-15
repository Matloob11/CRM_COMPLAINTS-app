# Work package 3 — frontend report

Deliverable: repository-root SPA — React 18 + Vite + TypeScript + Tailwind + TanStack Query, built to
static assets in `dist/`. Screenshots are in `screenshots/`.

Backend and infrastructure were not available while this was written, so every screen was built
and verified against a **typed in-browser mock** of the work-package-2 contract
(`src/mocks/`). The mock enforces the same isolation rule as the backend — an agent sees only
their own complaints and never an internal note — so the UI was never developed against a more
permissive contract than production.

---

## 1. What was verified in a real browser

Chromium (Playwright), driving the real build against the mock API. Every item below was
observed on screen, not merely coded:

| Behaviour | Evidence |
|---|---|
| Two-pane list + thread, admin | `01-admin-list-and-thread.png` |
| Internal-note composer, visually unmistakable | `02-composer-internal-note.png` |
| Status change forces a reason before it will save | `03-status-change-requires-note.png` |
| 180 MB chunked upload: real % , real MB/s, real ETA, cancel, typing unaffected | `04-large-upload-in-progress.png` |
| Agent sees only their own complaints (3 of 6) | `05-agent-list.png`, `16-failed-send-with-retry.png` |
| Empty state — agent with no complaints | `06-empty-no-complaints.png` |
| New-complaint modal with inline validation, no category field | `07-new-complaint-validation.png` |
| Empty state — filters match nothing, with a clear reset | `08-empty-no-match.png` |
| Error state — whole service unreachable, with retry | `09-error-with-retry.png` |
| Error state — list only, with retry | `09b-list-error-with-retry.png` |
| Loading skeletons that match the real layout | `10-loading-skeletons.png` |
| Session expired → "reopen Complaints from the CRM sidebar" | `11-session-expired.png` |
| Single pane below the container breakpoint, with a back button | `12-narrow-single-pane-list.png`, `13-narrow-thread-with-back.png` |
| Optimistic send: bubble appears before the server answers, then reconciles | `14-optimistic-send-pending.png`, `15-optimistic-send-reconciled.png` |
| A failed send never vanishes — it stays, marked, with Retry and Discard | `16-failed-send-with-retry.png` |
| New messages while scrolled up → counted "2 new messages" pill, viewport not yanked (measured `scrollTop` stayed at 0) | `17-jump-to-latest-pill.png` |
| SSE unavailable → quiet chip, 10-second polling fallback | `18-realtime-degraded-polling.png` |

Also verified interactively in the browser, without a screenshot:

- **Keyboard**: Tab reaches the skip link, every stat tile, every filter chip, the search box,
  each complaint row, and the composer; each stop shows a visible focus ring. Enter on a focused
  complaint row opens the thread; Escape closes the modal and returns focus.
- **Accessibility**: `axe-core` (WCAG 2.0/2.1 A and AA) reports **0 violations** on the admin
  list + thread, the agent empty state, and the new-complaint modal (`npm run a11y`). Three real
  issues found by that pass were fixed: an unlabelled file input, `aria-label` on a role-less
  span, and three text colours below 4.5:1.
- **Console**: no errors or warnings across all captured flows.

## 2. What was unit-tested only

`npm test` — 23 tests, all passing:

- Asia/Dubai day bucketing (a 21:30 UTC message belongs to the next Dubai day), Today/Yesterday
  separators, relative timestamps, byte and duration formatting.
- Streaming SHA-256 against published vectors, and proof that the digest is independent of how
  the file is sliced (this is what makes multi-gigabyte hashing safe).
- The status palette covers every status exactly once, with a distinct colour **and** a distinct
  glyph — the mechanical guarantee that status is never colour-only.
- Upload manager: chunk ordering, resume from the failed chunk (never restarting the transfer),
  immediate abandonment on a permanent rejection (401/403/413/422), and cancel.
- Composer keyboard contract: Enter sends, Shift+Enter breaks the line, an agent is never shown
  the internal-note toggle, and the composer changes appearance when the toggle is on.

## 3. What could not be verified, and why

- **Nothing was run inside the actual Bitrix24 iframe.** The portal placement is work package 1
  and was not live. `BX24.fitWindow()` wiring, the CSP `frame-ancestors` header, and the real
  token injection are therefore code-complete but unproven end to end. The BX24 calls are all
  wrapped in try/catch and degrade to a normal page when the SDK is absent, which is how the
  screenshots were taken.
- **No request has hit the Django API.** All API shapes come from `PROMPT-2-backend.md`; the
  open questions are written up in `docs/API-REQUESTS.md`.
- **Upload was proven to 180 MB, not to multiple gigabytes.** The mock simulates ~40 MB/s. The
  code paths that matter at 2 GB (fixed-size slicing, worker hashing, chunk-driven progress,
  resume) are the same ones exercised at 180 MB, but the real ceiling depends on nginx
  (`client_max_body_size 0`, `proxy_request_buffering off`) which belongs to work package 1.
- **Real video playback and PDF download** were not exercised: mock attachments are synthetic.
  The `<video>` element uses `preload="metadata"` and a poster, so opening a thread never starts
  downloading a large video.

## 4. Deviations from the specification

1. **`/users?role=admin` was added to the API surface.** The endpoint list in PROMPT-2 has no way
   to populate the admin assignee dropdown. The SPA calls it; if the backend names it
   differently, it is a one-line change. Written up as request 5.
2. **The admin "by author" filter is page-scoped.** With no directory endpoint, author options
   are derived from the complaints currently loaded. Flagged as request 6 with two ways to fix it.
3. **Delivery ticks depend on a field the contract does not define.** The SPA reads an optional
   `read_by_counterpart` boolean per message; absent means one tick. Request 3 proposes the
   alternative (`last_read_message_id`) if the backend prefers it.
4. **SSE authenticates by query parameter** (`?access_token=`), because `EventSource` cannot send
   headers. Request 4 asks the backend to accept it there and asks work package 1 to keep it out
   of the access log.
5. **The composer holds a send until in-flight uploads finish** rather than refusing it. Pressing
   Enter with an upload still running queues the message and dispatches it automatically when the
   last chunk lands, so the user is never blocked. The spec did not say what should happen here.
6. **The stat strip doubles as a filter.** Requirement 7 only asked for the counts; making the
   tiles clickable costs nothing and is the fastest route from "1 On Hold" to the row itself.
7. **Sourcemaps are built as `hidden`.** They exist for our debugging but carry no
   `sourceMappingURL`, so nginx never publishes the source.
8. **A dev-only mock backend ships in the repository** (`src/mocks/`). It is behind the
   build-time `VITE_MOCK` flag and is absent from the production bundle — verified by grepping
   `dist/` for mock fixture strings (0 hits in the JS, present only in the hidden sourcemap).

Nothing in the spec was skipped. Specifically: there is **no category field** and no substitute
for one; no login screen; no cookie is read or written; no portal URL, token, or secret is
compiled into the bundle; and no feature's safety depends on a hidden button — the role from
`/me` only decides what renders, and every admin-only action is one the backend rejects for an
agent regardless.

## 5. Handshake the other work packages need

- **Build output**: `dist/` (`index.html` + content-hashed `assets/`).
- **Proposed deploy path on the VPS**: `/opt/a7-complaints/web/`, served as the nginx site root,
  with `/api/` and `/bitrix/` proxied to `127.0.0.1:8200` and everything else falling back to
  `index.html`. Cache `assets/*` hard; never cache `index.html`.
- **Bootstrap contract**: `/bitrix/handler/` must render the shell and inject
  `window.__COMPLAINTS__ = { token, api_base }` before the module script. Two alternative shapes
  are also accepted — see `docs/API-REQUESTS.md`.

## 6. Running it

```bash
npm install
npm run dev:mock       # then open http://127.0.0.1:5273/?role=admin
npm test
npm run build
```

Mock scenarios (`?scenario=empty|slow|error|error-list|expired`, `?role=`, `?failSend=1`,
`?incoming=3`) are documented in `docs/SPA.md`; they are how every screenshot above was
produced, and how the states can be re-checked after any change.
