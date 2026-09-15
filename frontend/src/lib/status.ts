import type { Priority, Status } from '@/api/types'

/**
 * Single source of truth for the fixed status palette from CONTEXT.md.
 * open = blue, in_progress = amber, on_hold = slate, resolved = green,
 * rejected = red. The dot, the pill, the filter chip and the dashboard all read
 * from this map, so one colour always means one status.
 *
 * The values are tuned for dark glass rather than white paper. The original
 * light-mode inks go muddy once there is a 28px blur and a saturate behind
 * them, so hues are lifted for legibility and the tinted surfaces are alphas of
 * the hue itself — which lets the backdrop through and keeps the tint part of
 * the material instead of a sticker on top of it.
 *
 * Status is never conveyed by colour alone: every surface pairs the colour with
 * a label, and the dot carries a distinct glyph for colour-blind users.
 */
export interface StatusStyle {
  label: string
  /** Solid colour, for dots, bars and the glow inside a pill. */
  solid: string
  /** Tinted surface, for pills and chips. */
  soft: string
  /** Text colour on the tinted surface (>= 4.5:1 against the panel). */
  ink: string
  /** Hairline for the tinted surfaces. */
  border: string
  /** Shape glyph, so the state survives greyscale and colour blindness. */
  glyph: string
}

export const STATUS_STYLE: Record<Status, StatusStyle> = {
  open: {
    label: 'Open',
    solid: '#6FA8FF',
    soft: 'rgba(111, 168, 255, 0.16)',
    ink: '#C5DBFF',
    border: 'rgba(111, 168, 255, 0.42)',
    glyph: '●',
  },
  in_progress: {
    label: 'In Progress',
    solid: '#F0B45C',
    soft: 'rgba(240, 180, 92, 0.16)',
    ink: '#FBDFB2',
    border: 'rgba(240, 180, 92, 0.42)',
    glyph: '◐',
  },
  on_hold: {
    label: 'On Hold',
    solid: '#93A3BE',
    soft: 'rgba(147, 163, 190, 0.18)',
    ink: '#D2DCEC',
    border: 'rgba(147, 163, 190, 0.42)',
    glyph: '◼',
  },
  resolved: {
    label: 'Resolved',
    solid: '#4FD69C',
    soft: 'rgba(79, 214, 156, 0.16)',
    ink: '#B2EFD3',
    border: 'rgba(79, 214, 156, 0.42)',
    glyph: '✓',
  },
  rejected: {
    label: 'Rejected',
    solid: '#FF8078',
    soft: 'rgba(255, 128, 120, 0.16)',
    ink: '#FFC7C2',
    border: 'rgba(255, 128, 120, 0.42)',
    glyph: '✕',
  },
}

export function statusStyle(status: Status): StatusStyle {
  return STATUS_STYLE[status]
}

export function statusLabel(status: Status): string {
  return STATUS_STYLE[status].label
}

export interface PriorityStyle {
  label: string
  ink: string
  soft: string
  /** Number of filled bars in the priority indicator, 1-4. */
  level: number
}

export const PRIORITY_STYLE: Record<Priority, PriorityStyle> = {
  low: { label: 'Low', ink: 'rgba(230, 238, 253, 0.52)', soft: 'rgba(255, 255, 255, 0.06)', level: 1 },
  normal: { label: 'Normal', ink: 'rgba(233, 240, 252, 0.74)', soft: 'rgba(255, 255, 255, 0.07)', level: 2 },
  high: { label: 'High', ink: '#F0B45C', soft: 'rgba(240, 180, 92, 0.14)', level: 3 },
  urgent: { label: 'Urgent', ink: '#FF8078', soft: 'rgba(255, 128, 120, 0.14)', level: 4 },
}

export function priorityStyle(priority: Priority): PriorityStyle {
  return PRIORITY_STYLE[priority]
}
