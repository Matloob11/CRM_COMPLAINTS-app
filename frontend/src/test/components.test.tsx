import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Composer } from '@/features/thread/Composer'
import { ComplaintList } from '@/features/list/ComplaintList'
import { StatusPill } from '@/components/primitives'
import { Modal } from '@/components/Modal'
import type { ComplaintSummary } from '@/api/types'

const AUTHOR = {
  bitrix_id: 27,
  name: 'Sara Haddad',
  email: null,
  avatar_url: null,
  role: 'agent' as const,
}

function row(overrides: Partial<ComplaintSummary> = {}): ComplaintSummary {
  return {
    id: 1,
    ticket_no: 'CMP-000142',
    subject: 'Wrong listing photos on Damac Hills 2',
    status: 'in_progress',
    priority: 'high',
    author: AUTHOR,
    assigned_to: null,
    created_at: '2026-08-16T08:00:00Z',
    updated_at: '2026-08-18T08:00:00Z',
    resolved_at: null,
    last_message_at: '2026-08-18T08:00:00Z',
    last_message_preview: 'Media are re-exporting the correct set now.',
    unread_count: 2,
    ...overrides,
  }
}

describe('composer keyboard contract', () => {
  it('sends on Enter and breaks the line on Shift+Enter', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<Composer scope="test:1" onSend={onSend} isAdmin={false} />)

    const box = screen.getByLabelText('Write a message')
    await user.click(box)
    await user.keyboard('first line')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    await user.keyboard('second line')
    expect(onSend).not.toHaveBeenCalled()
    expect(box).toHaveValue('first line\nsecond line')

    await user.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledWith('first line\nsecond line', [], false)
    expect(box).toHaveValue('')
  })

  it('never offers the internal-note toggle to an agent', () => {
    const { rerender } = render(<Composer scope="test:2" onSend={vi.fn()} isAdmin={false} />)
    expect(screen.queryByRole('button', { name: 'Internal note' })).toBeNull()

    rerender(<Composer scope="test:2" onSend={vi.fn()} isAdmin />)
    expect(screen.getByRole('button', { name: 'Internal note' })).toBeInTheDocument()
  })

  it('marks the composer unmistakably when an admin is writing an internal note', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<Composer scope="test:3" onSend={onSend} isAdmin />)

    await user.click(screen.getByRole('button', { name: 'Internal note' }))
    expect(screen.getByText(/the agent will not see this/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Internal note' }))
    await user.click(screen.getByLabelText('Write a message'))
    await user.keyboard('visible reply{Enter}')
    expect(onSend).toHaveBeenCalledWith('visible reply', [], false)
  })
})

describe('complaint list states', () => {
  const noop = () => {}

  it('shows a first-run empty state with the next action for an agent', () => {
    render(
      <ComplaintList
        rows={[]}
        loading={false}
        error={null}
        onRetry={noop}
        selectedId={null}
        onSelect={noop}
        isAdmin={false}
        filtered={false}
        onClearFilters={noop}
        onNew={noop}
      />,
    )
    expect(screen.getByText('You have not raised a complaint yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new complaint/i })).toBeInTheDocument()
  })

  it('distinguishes "no results for these filters" from "nothing exists"', () => {
    render(
      <ComplaintList
        rows={[]}
        loading={false}
        error={null}
        onRetry={noop}
        selectedId={null}
        onSelect={noop}
        isAdmin={false}
        filtered
        onClearFilters={noop}
        onNew={noop}
      />,
    )
    expect(screen.getByText('No complaints match these filters')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
  })

  it('offers a retry when the list fails to load', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <ComplaintList
        rows={[]}
        loading={false}
        error={new Error('boom')}
        onRetry={onRetry}
        selectedId={null}
        onSelect={noop}
        isAdmin={false}
        filtered={false}
        onClearFilters={noop}
        onNew={noop}
      />,
    )
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('hides the author from an agent and shows it to an admin', () => {
    const { rerender } = render(
      <ComplaintList
        rows={[row()]}
        loading={false}
        error={null}
        onRetry={noop}
        selectedId={null}
        onSelect={noop}
        isAdmin={false}
        filtered={false}
        onClearFilters={noop}
        onNew={noop}
      />,
    )
    expect(screen.queryByText('Sara Haddad')).toBeNull()

    rerender(
      <ComplaintList
        rows={[row()]}
        loading={false}
        error={null}
        onRetry={noop}
        selectedId={null}
        onSelect={noop}
        isAdmin
        filtered={false}
        onClearFilters={noop}
        onNew={noop}
      />,
    )
    expect(screen.getByText('Sara Haddad')).toBeInTheDocument()
  })

  it('announces the unread count to assistive technology', () => {
    render(
      <ComplaintList
        rows={[row({ unread_count: 3 })]}
        loading={false}
        error={null}
        onRetry={noop}
        selectedId={null}
        onSelect={noop}
        isAdmin={false}
        filtered={false}
        onClearFilters={noop}
        onNew={noop}
      />,
    )
    expect(screen.getByText('Unread messages:')).toBeInTheDocument()
  })
})

describe('status is never colour-only', () => {
  it('pairs every pill with its written label', () => {
    render(<StatusPill status="on_hold" />)
    expect(screen.getByText('On Hold')).toBeInTheDocument()
  })
})

describe('modal focus does not fight the typist', () => {
  /**
   * Regression: the focus-trap effect depended on `onClose`, which every caller
   * passes as an inline arrow. Each parent render therefore tore the effect
   * down and set it up again, pulling focus back to the top of the dialog — so
   * a poll tick landing while someone was typing in the second field threw the
   * caret back to the first. The effect is now keyed on `open` alone.
   *
   * The re-render here carries a fresh `onClose` identity and no user
   * interaction, which is exactly the situation that used to break it.
   */
  const dialog = () => (
    <Modal open title="Raise a complaint" onClose={() => undefined}>
      <input aria-label="Subject" />
      <textarea aria-label="What happened?" />
    </Modal>
  )

  it('leaves the caret where the typist put it when the parent re-renders', async () => {
    const user = userEvent.setup()
    const { rerender } = render(dialog())

    const body = screen.getByLabelText('What happened?')
    await user.click(body)
    await user.keyboard('crane damaged')

    rerender(dialog())

    expect(body).toHaveFocus()
    expect(body).toHaveValue('crane damaged')
  })

  it('opens with the first field focused rather than the close button', () => {
    render(dialog())
    expect(screen.getByLabelText('Subject')).toHaveFocus()
  })
})
