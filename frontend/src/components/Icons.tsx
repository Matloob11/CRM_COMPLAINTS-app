import type { SVGProps } from 'react'

/**
 * Hand-rolled 20px icon set on a 24-unit grid, 1.6 stroke.
 * Bundling a whole icon library for fourteen glyphs is not worth the weight,
 * and a consistent stroke weight is part of the visual discipline here.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Svg>
)

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconSend = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 11.5 20 4l-7.5 15.5-2-6z" />
    <path d="m10.5 13.5 9.5-9.5" />
  </Svg>
)

export const IconPaperclip = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11.5 12.3 19a4.5 4.5 0 0 1-6.4-6.4l8-8a3 3 0 1 1 4.3 4.3l-7.9 7.9a1.5 1.5 0 0 1-2.1-2.1l7.3-7.3" />
  </Svg>
)

export const IconBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5.5 8.5 12l6.5 6.5" />
  </Svg>
)

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9.5 6 6 6-6" />
  </Svg>
)

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
  </Svg>
)

export const IconRetry = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4.5h-4.5" />
  </Svg>
)

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5 21 20H3z" />
    <path d="M12 10v4.2M12 17.2v.1" />
  </Svg>
)

export const IconInbox = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 13.5 6 5h12l2 8.5V19H4z" />
    <path d="M4 13.5h4.5l1.2 2.3h4.6l1.2-2.3H20" />
  </Svg>
)

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="9" rx="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 1 1 7 0v2.5" />
  </Svg>
)

export const IconArrowDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
)

export const IconFile = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3.5H7.5a1.5 1.5 0 0 0-1.5 1.5v14a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V7.5z" />
    <path d="M14 3.5v4h4" />
  </Svg>
)

export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 6.5v11l9-5.5z" />
  </Svg>
)

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 19.5c1.3-3.1 4-4.6 7-4.6s5.7 1.5 7 4.6" />
  </Svg>
)

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
)

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v10.5M7.5 10 12 14.5 16.5 10" />
    <path d="M5 19.5h14" />
  </Svg>
)

/** Delivery ticks. One tick = sent, two = read, dashed clock = pending. */
export function TickIcon({ state }: { state: 'pending' | 'sent' | 'read' | 'failed' }) {
  if (state === 'pending') {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" className="opacity-70">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 4.8V8l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  if (state === 'failed') {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 4.9v3.6M8 10.7v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width="17" height="15" viewBox="0 0 18 16" aria-hidden="true">
      <path
        d="M1.5 8.6 4.6 11.8 10.6 4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {state === 'read' && (
        <path
          d="M6.6 8.6 9.7 11.8 15.7 4.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

export const IconGauge = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
    <path d="m12 13 4-3.5" />
    <circle cx="12" cy="13.5" r="1.4" />
  </Svg>
)

export const IconSliders = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 7h9M18 7h1M5 12h3M12 12h7M5 17h9M18 17h1" />
    <circle cx="16" cy="7" r="1.6" />
    <circle cx="10" cy="12" r="1.6" />
    <circle cx="16" cy="17" r="1.6" />
  </Svg>
)

export const IconSpark = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.8 6.8l2.1 2.1M15.1 15.1l2.1 2.1M17.2 6.8l-2.1 2.1M8.9 15.1l-2.1 2.1" />
  </Svg>
)
