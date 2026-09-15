/**
 * Bitrix24 iframe glue.
 *
 * BX24.fitWindow() tells the CRM shell how tall this iframe wants to be. Without
 * it the frame either clips the composer or renders a second scrollbar inside
 * the CRM's own scroller. It has to be called on mount and on every layout
 * change that alters document height, and it has to be debounced because layout
 * changes arrive in bursts (image decode, font swap, pane switch).
 *
 * The app never touches window.top.location and never tries to navigate the
 * parent frame.
 */

let scheduled: number | null = null

function callFit(): void {
  scheduled = null
  const bx = window.BX24
  if (!bx) return
  try {
    bx.fitWindow?.()
  } catch {
    // Older on-premise builds throw when the placement does not support
    // resizing. Silently ignoring keeps the app usable.
  }
}

/** Debounced BX24.fitWindow(). Safe to call on every resize tick. */
export function fitWindow(delay = 120): void {
  if (typeof window === 'undefined') return
  if (scheduled !== null) window.clearTimeout(scheduled)
  scheduled = window.setTimeout(callFit, delay)
}

/** Loads the BX24 SDK from the portal, then runs `onReady`. Idempotent. */
export function initBitrix(onReady: () => void): void {
  if (typeof window === 'undefined') return

  const run = () => {
    try {
      window.BX24?.init?.(() => {
        fitWindow(0)
        onReady()
      })
    } catch {
      onReady()
    }
  }

  if (window.BX24) {
    run()
    return
  }

  const existing = document.querySelector<HTMLScriptElement>('script[data-bx24]')
  if (existing) {
    existing.addEventListener('load', run, { once: true })
    return
  }

  // The portal URL is never hardcoded in the bundle; it is supplied at build
  // time (VITE_BITRIX_PORTAL) or by the bootstrap HTML, which already includes
  // the SDK <script> in production.
  const portal = import.meta.env.VITE_BITRIX_PORTAL
  if (!portal) {
    onReady()
    return
  }
  const script = document.createElement('script')
  script.src = `${String(portal).replace(/\/$/, '')}/js/rest-client/api-client.js`
  script.async = true
  script.dataset.bx24 = 'true'
  script.addEventListener('load', run, { once: true })
  script.addEventListener('error', () => onReady(), { once: true })
  document.head.appendChild(script)
}
