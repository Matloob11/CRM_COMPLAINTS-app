# Work Package 3 — React Frontend, WhatsApp-Style Interface

Paste everything below the line into the agent.

---

Read `CONTEXT.md` in this folder before doing anything. It contains the verified server
inventory, the chosen architecture, and the authentication design. Do not re-derive any of it.

You own **work package 3 of 3**. Another agent provisions infrastructure and the Bitrix
sidebar entry; a third builds the Django API. You build the single-page application that runs
inside the CRM iframe.

Do not touch server configuration or backend code. If the API contract is missing a field you
need, write the request down and keep building against a typed mock.

UI/UX quality is a stated primary requirement from the business owner, not a finishing touch.
A functionally correct but generic-looking result does not meet the brief.

## Stack

React 18 + Vite + TypeScript + Tailwind CSS. TanStack Query for server state. Build to static
assets served by nginx — coordinate the output path with the work-package-1 agent.

## Runtime context — read this carefully

This app renders inside an iframe inside Bitrix24. That imposes constraints most SPAs never hit:

- The auth token arrives injected into the bootstrap HTML by the backend handler. Read it
  once, hold it in memory and in `sessionStorage`, and send it as `Authorization: Bearer` on
  every request. **There are no cookies.** Do not add a login screen; there is no login.
- Load the Bitrix JS API and call `BX24.fitWindow()` on mount and on any layout change that
  alters document height, otherwise the iframe clips content or renders a double scrollbar.
  Debounce it.
- The available viewport is the CRM content area, not the browser window. It is narrower than
  a normal desktop app and its width changes when the user collapses the CRM sidebar. Use a
  `ResizeObserver` on your own root, never a `window` media query, for layout breakpoints.
- Never call `window.top.location` or attempt to navigate the parent frame.

## Screens

### Complaint list — left pane

- Rows show: status dot, subject, last-message preview (single line, ellipsised), relative
  timestamp, unread count badge, priority indicator, and — for admins only — the author's name
  and avatar.
- Sorted by last activity, newest first.
- Sticky filter bar: search input, and status chips `All / Open / In Progress / On Hold /
  Resolved / Rejected` each carrying a live count.
- Admin-only extra filters: by assignee, by author, unassigned.
- Author names come from the API, sourced from Bitrix. Never render a client-entered name.
- A stat strip above the list: total raised, and a count per status, scoped to the caller.
  This is requirement 7 from the brief — an agent must be able to see at a glance how many
  complaints they have raised and where each stands.

### Thread — right pane

This is the WhatsApp-feeling surface. Get it right.

- Header: ticket number, subject, a status pill in the fixed palette, assignee avatar, and —
  for admins — a status dropdown and an assign control.
- Message bubbles: the caller's own messages right-aligned, the counterpart's left-aligned,
  `kind=system` messages centred as small muted pills ("Status changed to In Progress by
  Admin — reason: waiting on vendor").
- Day separators: `Today`, `Yesterday`, then a formatted date.
- Delivery ticks: pending, sent, read — driven by the read-receipt endpoint.
- Optimistic send. The bubble appears the instant the user presses enter, in a pending state,
  and reconciles when the server responds. On failure it goes to a failed state with a retry
  affordance; it must never silently vanish.
- Composer: auto-growing textarea, enter to send, shift-enter for a newline, attachment
  button, drag-and-drop anywhere over the thread, and paste-to-upload for screenshots.
- Admin-only internal-note toggle in the composer. When active, the composer changes colour
  distinctly and the resulting bubble is visibly marked. An admin must never be in doubt about
  whether the agent can see what they are typing.
- Auto-scroll to the newest message only when the user is already near the bottom. If they
  have scrolled up to read history, show a "jump to latest" pill with a new-message count
  instead of yanking the viewport.

### New complaint

A focused modal, not a separate route: subject, priority, description, attachments. There is
deliberately no category field — the owner rejected it, so do not add one or any substitute
for it.
Validate inline. Keep the draft in `sessionStorage` so an accidental close does not lose a
long description.

### Attachments

- Images: inline thumbnail, click for a lightbox.
- Video: inline `<video>` player with a poster frame, never autoplaying.
- PDF and everything else: a file card with icon, filename, and human-readable size.
- Uploads use the chunked endpoints. Show a real progress bar driven by chunk completion, a
  cancel control, and automatic resume on a transient network failure. A multi-gigabyte video
  is an expected case, not an edge case — the UI must stay responsive and the user must be
  able to keep typing and reading while it uploads in the background.

## Realtime

Subscribe to the SSE endpoint. On event, update the TanStack Query cache surgically rather
than refetching the world. If the stream drops, fall back to 10-second polling and reconnect
with exponential backoff. Show a subtle, non-alarming reconnecting indicator — not a modal.

## Responsive behaviour

Two panes above roughly 900px of available width; below that, a single pane with a back
button. The breakpoint reads your own container width, not the browser viewport, because the
CRM sidebar steals horizontal space.

## Visual direction

Do not ship the default Tailwind look. The app sits inside Bitrix24, so it should feel
deliberately designed and calm next to the CRM chrome rather than fighting it.

- Commit to a real type scale and consistent spacing rhythm. Most of the perceived quality
  comes from spacing discipline and restraint, not decoration.
- Use the fixed status palette from `CONTEXT.md` and use it in exactly one way everywhere:
  the same colour means the same status in the dot, the pill, the chip, and the stat strip.
- Every list, thread, and filter result needs three designed states: loading (skeletons that
  match the real layout, not spinners), empty (with a clear next action), and error (with a
  retry). Empty states are the first thing a new agent sees — make that screen good.
- Animate only what communicates: bubble entry, status transitions, pane changes. Nothing
  decorative. Honour `prefers-reduced-motion`.
- Accessibility is part of done: full keyboard navigation, visible focus rings, correct ARIA
  roles on the message log, WCAG AA contrast. Status must never be conveyed by colour alone —
  pair it with a label or icon for colour-blind users.

## Non-negotiables

- The role from `/me` drives what renders, but treat this as convenience only — the backend is
  the authority. Never build a feature whose safety depends on a hidden button.
- No secrets, API keys, or portal URLs hardcoded in the bundle. Configure at build time.
- Handle `401` by showing a clear "session expired, reopen Complaints from the CRM sidebar"
  screen. There is no refresh flow from inside the iframe.
- Type the API responses. No `any` on network boundaries.

## Report back

List every deviation from this specification and why. Include screenshots of the list, the
thread, the composer with the internal-note toggle active, an in-progress large upload, and
each empty state. State plainly which behaviours you verified in a real browser and which you
only unit-tested.
