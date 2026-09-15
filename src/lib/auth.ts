/**
 * Token acquisition for the iframe runtime.
 *
 * There is no login screen and there are no cookies. The Django `/bitrix/handler/`
 * endpoint renders the SPA bootstrap HTML with the freshly minted JWT injected
 * into the page. We read it exactly once at startup, keep it in module memory,
 * and mirror it into `sessionStorage` so a soft reload of the iframe (which
 * Bitrix does on some placements) does not lose it.
 *
 * Three injection shapes are accepted so the backend agent can pick whichever is
 * most convenient; all three are documented in docs/API-REQUESTS.md.
 *   1. window.__COMPLAINTS__ = { token, api_base?, user? }
 *   2. <script id="complaints-bootstrap" type="application/json">{ "token": "..." }</script>
 *   3. <meta name="complaints-token" content="...">
 */

const STORAGE_KEY = 'a7c.token'
const PLACEMENT_KEY = 'a7c.placement'

export interface BootstrapPayload {
  token?: string
  api_base?: string
  placement?: string
  placement_options?: Record<string, unknown>
}

declare global {
  interface Window {
    __COMPLAINTS__?: BootstrapPayload
    BX24?: {
      init?: (cb: () => void) => void
      fitWindow?: () => void
      resizeWindow?: (w: number, h: number) => void
    }
  }
}

function readInjected(): BootstrapPayload {
  if (typeof window === 'undefined') return {}

  const direct = window.__COMPLAINTS__
  if (direct && typeof direct === 'object') return direct

  const el = document.getElementById('complaints-bootstrap')
  if (el?.textContent) {
    try {
      const parsed: unknown = JSON.parse(el.textContent)
      if (parsed && typeof parsed === 'object') return parsed as BootstrapPayload
    } catch {
      // Malformed bootstrap JSON is treated as "no token"; the app then shows
      // the reopen-from-CRM screen rather than crashing on a blank page.
    }
  }

  const meta = document.querySelector<HTMLMetaElement>('meta[name="complaints-token"]')
  if (meta?.content) return { token: meta.content }

  return {}
}

let token: string | null = null
let apiBase = '/api/v1'

export function initAuth(): { token: string | null; apiBase: string } {
  const injected = readInjected()

  if (injected.token) {
    token = injected.token
    try {
      sessionStorage.setItem(STORAGE_KEY, injected.token)
    } catch {
      // Private-mode / storage-partitioned iframe: memory-only is still correct.
    }
  } else {
    try {
      token = sessionStorage.getItem(STORAGE_KEY)
    } catch {
      token = null
    }
  }

  if (injected.api_base) apiBase = injected.api_base
  else if (import.meta.env.VITE_API_BASE) apiBase = String(import.meta.env.VITE_API_BASE)

  if (injected.placement) {
    try {
      sessionStorage.setItem(PLACEMENT_KEY, injected.placement)
    } catch {
      /* non-fatal */
    }
  }

  return { token, apiBase }
}

export function getToken(): string | null {
  return token
}

export function getApiBase(): string {
  return apiBase
}

/** Called when the backend rejects the token; forces the session-expired screen. */
export function clearToken(): void {
  token = null
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* non-fatal */
  }
}
