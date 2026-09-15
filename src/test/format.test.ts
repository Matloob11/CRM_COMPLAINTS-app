import { describe, expect, it } from 'vitest'
import {
  dayKey,
  formatBytes,
  formatDaySeparator,
  formatDuration,
  formatRelative,
  initials,
} from '@/lib/format'
import { sha256Hex } from '@/lib/sha256'
import { STATUS_STYLE } from '@/lib/status'
import { STATUSES } from '@/api/types'

describe('timestamps render in Asia/Dubai', () => {
  it('keeps a late-evening UTC instant on the next Dubai day', () => {
    // 21:30 UTC on 4 August is 01:30 on 5 August in Dubai (UTC+4).
    expect(dayKey('2025-08-04T21:30:00Z')).toBe('2025-08-05')
  })

  it('labels today and yesterday, then falls back to a date', () => {
    const now = new Date('2025-08-18T10:00:00Z')
    expect(formatDaySeparator('2025-08-18T06:00:00Z', now)).toBe('Today')
    expect(formatDaySeparator('2025-08-17T06:00:00Z', now)).toBe('Yesterday')
    expect(formatDaySeparator('2025-08-11T06:00:00Z', now)).toContain('August')
    expect(formatDaySeparator('2024-02-03T06:00:00Z', now)).toContain('2024')
  })
})

describe('relative timestamps', () => {
  const now = new Date('2025-08-18T10:00:00Z')

  it('collapses the first hour to minutes', () => {
    expect(formatRelative('2025-08-18T09:59:40Z', now)).toBe('now')
    expect(formatRelative('2025-08-18T09:48:00Z', now)).toBe('12m')
  })

  it('shows a clock time later the same day and a date beyond yesterday', () => {
    expect(formatRelative('2025-08-18T04:00:00Z', now)).toMatch(/^\d{2}:\d{2}$/)
    expect(formatRelative('2025-08-17T04:00:00Z', now)).toBe('Yesterday')
    expect(formatRelative('2025-08-02T04:00:00Z', now)).toMatch(/Aug/)
  })
})

describe('human-readable sizes', () => {
  it('scales into GB for the multi-gigabyte upload case', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(920)).toBe('920 B')
    expect(formatBytes(1024)).toBe('1.00 KB')
    expect(formatBytes(1_820_004_991)).toBe('1.70 GB')
  })

  it('formats video durations', () => {
    expect(formatDuration(214)).toBe('3:34')
    expect(formatDuration(3_671)).toBe('1:01:11')
    expect(formatDuration(null)).toBeNull()
  })
})

describe('initials', () => {
  it('uses the first and last name', () => {
    expect(initials('Admin Abdul Malik')).toBe('AM')
    expect(initials('Sara')).toBe('S')
    expect(initials('   ')).toBe('?')
  })
})

describe('streaming sha256', () => {
  it('matches the published vectors', () => {
    expect(sha256Hex(new TextEncoder().encode(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('is unaffected by how the input is chunked', async () => {
    const { Sha256Stream } = await import('@/lib/sha256')
    const bytes = new Uint8Array(200_000).map((_, index) => index % 251)

    const oneShot = sha256Hex(bytes)
    const streamed = new Sha256Stream()
    for (let offset = 0; offset < bytes.length; offset += 7_919) {
      streamed.update(bytes.subarray(offset, offset + 7_919))
    }
    expect(streamed.digestHex()).toBe(oneShot)
  })
})

describe('status palette', () => {
  it('covers every status exactly once with a distinct colour and glyph', () => {
    const colours = STATUSES.map((status) => STATUS_STYLE[status].solid)
    const glyphs = STATUSES.map((status) => STATUS_STYLE[status].glyph)
    expect(new Set(colours).size).toBe(STATUSES.length)
    // Status is never colour-only: each state also has its own glyph.
    expect(new Set(glyphs).size).toBe(STATUSES.length)
  })
})
