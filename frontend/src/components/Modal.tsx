import { useEffect, useId, useRef, type ReactNode } from 'react'
import clsx from 'clsx'
import { IconButton } from './primitives'
import { IconClose } from './Icons'

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Dialog with a real focus trap and Escape-to-close.
 *
 * It is anchored towards the top of the frame rather than vertically centred:
 * the iframe is resized to its content by BX24.fitWindow(), so a viewport-centred
 * dialog can end up below the fold of the CRM page.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = 'max-w-xl',
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descId = useId()

  // The effect below sets up focus, and must run exactly once per opening.
  // `onClose` is nearly always an inline arrow from the caller, so depending on
  // it directly re-ran the whole effect on every parent render: the cleanup
  // threw focus back to the trigger and the setup then focused the close
  // button, which meant typing one character in a field lost the caret. Reading
  // the callback through a ref keeps the effect keyed on `open` alone.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null

    const panel = panelRef.current
    // Prefer the first field over the first focusable node. The close button is
    // first in the DOM, and opening a form with the caret on "dismiss" is both
    // unhelpful and a keystroke away from losing the draft.
    const first =
      panel?.querySelector<HTMLElement>('input:not([disabled]),textarea:not([disabled]),select:not([disabled])') ??
      panel?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      )
      if (nodes.length === 0) return
      const firstNode = nodes[0] as HTMLElement
      const lastNode = nodes[nodes.length - 1] as HTMLElement
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault()
        lastNode.focus()
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault()
        firstNode.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      restoreRef.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div
        className="fixed inset-0 bg-[#04070f]/55 backdrop-blur-[3px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={clsx(
          'glass-raised relative mt-6 w-full rounded-pane animate-pop-in',
          width,
        )}
      >
        <div className="flex items-start gap-4 border-b border-ink-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight text-ink-900">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-sm text-ink-500">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-1.5 -mt-1">
            <IconClose size={18} />
          </IconButton>
        </div>

        <div className="px-5 py-4">{children}</div>

        {footer ? (
          <div className="flex items-center justify-end gap-2 rounded-b-pane border-t border-ink-100 bg-white/[0.03] px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
