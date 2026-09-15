import { useEffect, useState, type RefObject } from 'react'

/**
 * Breakpoints are measured on our own root element, never on `window`.
 * The usable width is the CRM content area, and it changes when the user
 * collapses the Bitrix sidebar without any window resize happening at all.
 */
export const TWO_PANE_MIN_WIDTH = 900

export function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState<number>(() => ref.current?.clientWidth ?? 0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    setWidth(el.clientWidth)

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const next = entry.contentRect.width
      setWidth((prev) => (Math.abs(prev - next) < 1 ? prev : next))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return width
}

export function useIsTwoPane(ref: RefObject<HTMLElement | null>): boolean {
  const width = useContainerWidth(ref)
  // Before first measurement assume two panes: the CRM content area is wide by
  // default, and this avoids a single-pane flash on load.
  return width === 0 ? true : width >= TWO_PANE_MIN_WIDTH
}
