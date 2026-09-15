/** Display formatting. Timestamps are stored in UTC and rendered in Asia/Dubai. */

export const TIME_ZONE = 'Asia/Dubai'

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TIME_ZONE,
})

const dayFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: TIME_ZONE,
})

const dayWithYearFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: TIME_ZONE,
})

const fullFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TIME_ZONE,
})

/** Calendar day key in Asia/Dubai, e.g. "2026-08-18". Used for day separators. */
export function dayKey(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: TIME_ZONE,
  }).format(d)
  return parts
}

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso))
}

export function formatFull(iso: string): string {
  return fullFmt.format(new Date(iso))
}

/** "Today" / "Yesterday" / "Monday, 4 August" / "4 August 2025". */
export function formatDaySeparator(iso: string, now: Date = new Date()): string {
  const key = dayKey(iso)
  const todayKey = dayKey(now)
  if (key === todayKey) return 'Today'

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (key === dayKey(yesterday)) return 'Yesterday'

  const date = new Date(iso)
  const sameYear = date.getUTCFullYear() === now.getUTCFullYear()
  return sameYear ? dayFmt.format(date) : dayWithYearFmt.format(date)
}

/** Compact relative label for list rows: "now", "12m", "3h", "Yesterday", "4 Aug". */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime()
  const diff = now.getTime() - then
  const minutes = Math.floor(diff / 60_000)

  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`

  const key = dayKey(iso)
  if (key === dayKey(now)) return formatTime(iso)

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (key === dayKey(yesterday)) return 'Yesterday'

  const date = new Date(iso)
  const sameYear = date.getUTCFullYear() === now.getUTCFullYear()
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: '2-digit' }),
    timeZone: TIME_ZONE,
  }).format(date)
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / Math.pow(1024, exponent)
  const decimals = exponent === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(decimals)} ${UNITS[exponent]}`
}

export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`
}

/** Rough transfer-rate label used by the upload tray. */
export function formatRate(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return ''
  return `${formatBytes(bytesPerSecond)}/s`
}

export function formatEta(secondsRemaining: number): string {
  if (!Number.isFinite(secondsRemaining) || secondsRemaining <= 0) return ''
  if (secondsRemaining < 60) return `${Math.ceil(secondsRemaining)}s left`
  const minutes = Math.round(secondsRemaining / 60)
  if (minutes < 60) return `${minutes} min left`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m left`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}
