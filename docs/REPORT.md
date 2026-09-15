# Work package 3 — delivery report

React 18 + Vite + TypeScript + Tailwind + TanStack Query SPA for the A7 Complaints system,
built to static assets in `dist/` for nginx to serve inside the Bitrix24 iframe.

- `npm run test` — 23 tests, 3 files, all passing.
- `npm run build` — typecheck clean (`tsc --noEmit`, `strict`, `noUncheckedIndexedAccess`), build
  succeeds. 257 kB JS / 80 kB gzipped, 33 kB CSS / 6.7 kB gzipped, plus a 3.2 kB hashing worker.
- The development mock is dynamically imported behind `VITE_MOCK` and is verifiably absent from
  the production bundle (`grep` for its fixtures over `dist/` returns nothing).

## Verified in a real browser (Chromium, via Playwright)

Screenshots in `docs/screenshots/`, all taken from the running app against the typed mock API.

| # | Screenshot | What it proves |
|---|---|---|
| 01 | `01-list-admin.png` | Admin list: stat strip, sticky filter bar with live counts, admin-only assignee/author filters, author name and avatar on each row, unread badges, two-pane layout |
| 02 | `02-composer-internal-note.png` | Internal-note mode: amber composer, amber send button, persistent "the agent will not see this" banner |
| 03 | `03-thread-internal-bubble.png` | The resulting bubble is amber and labelled "Internal note — not visible to the agent" |
| 04 | `04-upload-in-progress.png` | 305 MB upload at 68%, real rate (27.3 MB/s) and ETA from acknowledged chunks, cancel control, and text being typed in the composer while it uploads |
| 05 | `05-new-complaint-modal.png` | New-complaint modal: subject, priority, description, attachments, no category field, draft-kept notice |
| 06 | `06-after-create.png` | Creation opens the new thread, stat strip and chips update |
| 07 | `07-status-note-required.png` | Admin status change refuses to proceed without a reason, inline error |
| 08 | `08-status-changed.png` | The reason lands in the thread as a centred system pill; pill, chips and counts update |
| 09 | `09-agent-view.png` | Same data as an agent: only their own complaints, no author column, no admin filters, no status/assign controls, no internal-note toggle, and the internal note is absent from the thread and from the list preview |
| 10 | `10-jump-to-latest.png` | Scrolled up in history: the jump-to-latest pill appears instead of the viewport being yanked |
| 11 | `11-narrow-thread.png` | Below the 900 px measured breakpoint: single pane with a back button |
| 12 | `12-narrow-list.png` | Single-pane list |
| 13 | `13-empty-state.png` | First-run empty state with the next action |
| 14 | `14-error-state.png` | Service unreachable, with retry |
| 15 | `15-session-expired.png` | 401 → "reopen Complaints from the CRM sidebar", no login screen, no refresh attempt |
| 16 | `16-loading-skeletons.png` | Skeletons that match the real row geometry, and the "Connecting" realtime chip |
| 17 | `17-drag-and-drop.png` | Drag-over overlay across the whole thread |

Also exercised live in the browser, without a screenshot:

- **Optimistic send** — bubble appears immediately, reconciles when the POST resolves (visible
  between screenshots 02 → 03 and in the upload flow).
- **Drag-and-drop and paste-to-upload** — a `drop` on the thread and a `paste` into the composer
  were dispatched with real `File` objects; both produced uploads that ran to
  "Ready to send" (`ceiling-damage.jpg` 256 KB, `screenshot.png` 128 KB).
- **Two-pane ⇄ one-pane switching** driven by the measured container width, not a media query.
- **Selection, filtering by status chip and by stat tile, search** against the mock.
- **Assign control** writing `assigned_to`.

## Verified by unit test only

`npm run test`, 23 tests:

- Chunked upload: ordered chunk sequencing; **resume from the failed chunk** (chunk 1 retried,
  chunk 0 never re-sent); no retry on a permanent 403; cancel mid-flight leaves nothing sendable.
- Streaming SHA-256 against the published vectors, and identical output regardless of slice size
  — this is what makes hashing a multi-gigabyte file possible without holding it in memory.
- Asia/Dubai day boundaries (21:30 UTC is already the next day), Today/Yesterday separators,
  relative list timestamps, byte and duration formatting.
- Composer keyboard contract: Enter sends, Shift+Enter breaks the line, and the internal-note
  toggle is absent for agents.
- List states: first-run empty vs "no results for these filters", error with retry, author hidden
  from agents and shown to admins, unread count announced to assistive technology.
- Status palette: five distinct colours **and** five distinct glyphs, so status is never
  colour-only.

## Not verified end to end

- **Everything ran against the typed mock in `src/mocks/`, not the Django API**, which was still
  being built in parallel. The mock implements the contract in `PROMPT-2-backend.md` including
  the isolation rule (404, never 403) and internal-note stripping, but the real server is the
  authority and the first integration pass may surface field-shape differences. Open questions are
  written up in `docs/API-REQUESTS.md`.
- **`BX24.fitWindow()` has never run against a real Bitrix portal.** The glue is written and
  debounced and is wired to mount, pane changes, message arrival and a `ResizeObserver` on the
  document element; it no-ops safely when the SDK is absent, which is how it behaved in
  development. Whether the CRM shell resizes correctly can only be confirmed inside the portal.
- **SSE against the real stream.** The realtime hook, the surgical cache patching and the
  fall-back-to-polling path were driven by a mock `EventSource`. Backoff timing and heartbeat
  behaviour against the Django endpoint are untested.
- **A true multi-gigabyte upload.** The largest real file pushed through the UI was 305 MB
  against the mock upload endpoints. Chunk count, progress accounting and memory behaviour are
  size-independent by construction (the file is read one slice at a time), but the 1 GB+ path
  through nginx belongs to work package 1's end-to-end test.
- **Video playback.** The mock has no real video bytes, so the poster/click-to-play card was
  verified but an actual `<video>` stream was not.
- **Screen-reader pass.** Roles, labels, focus trapping, the message log's `aria-live` and
  keyboard operation are implemented and partly asserted in tests, but no assistive-technology
  session was run.

## Deviations from the specification

1. **Two additional token-injection shapes.** The spec says the token is injected into the
   bootstrap HTML. The reader accepts `window.__COMPLAINTS__`, a `<script type="application/json">`
   block, or a `<meta>` tag, and falls back to `sessionStorage`, so work package 2 can pick
   whichever is convenient. No behaviour change.

2. **SSE token travels as a query parameter.** `EventSource` cannot send an `Authorization`
   header. `GET /events?access_token=…` is the only option short of adding a dependency; flagged
   for the backend in `docs/API-REQUESTS.md` with a request to keep it out of access logs.

3. **`GET /users?role=admin` is invented.** The contract has no endpoint for the assignee
   dropdown. The call degrades to "Unassigned plus the current assignee" if it 404s, and agents
   never make it.

4. **Sending while an upload is in flight queues the message** rather than blocking the composer.
   The spec asks for the user to keep typing during a large upload; pressing Enter mid-upload
   holds the message and dispatches it the moment the last chunk is acknowledged, with a status
   line saying so. Nothing is lost and nothing is disabled.

5. **Client-side SHA-256 in a worker.** Not requested, but `POST /uploads/complete` requires a
   client-supplied checksum and `crypto.subtle.digest` is one-shot, so a streaming implementation
   was necessary for the no-size-cap requirement. Falls back to a yielding main-thread loop if
   workers are unavailable.

6. **Pagination is wired but not surfaced.** `page` and `after_id` are in the client and the
   query keys; the UI renders page 1 only. At the stated volumes an infinite-scroll affordance
   would be noise. Trivial to enable when the backend reports a `next`.

7. **The stat tiles double as status filters.** The spec asks for a stat strip and, separately,
   for status chips. Both exist, they share one source of truth (`GET /stats`) and are kept in
   sync; the tiles are also clickable because a number the user is looking at should be one click
   from the list that produced it.

8. **The "nothing selected" pane does not repeat the New complaint button** when the list is
   empty, because the list's own empty state already carries that call to action and three
   identical primary buttons on one screen read as noise.

9. **No category field, and no substitute.** Confirmed: there is no department, type or tag
   anywhere in the types, the UI or the mock.

## Notes for the other work packages

- **Work package 1:** build with `npm ci && npm run build` at the repository root, deploy the contents of
  `dist/`. `index.html` must not be cached; `assets/*` is content-hashed and can be
  cached immutably. The app needs no headers beyond the CSP already specified and sets no cookies.
- **Work package 2:** the bootstrap-HTML contract, the token shapes and the nine open API
  questions are in `README.md` and `docs/API-REQUESTS.md`.
