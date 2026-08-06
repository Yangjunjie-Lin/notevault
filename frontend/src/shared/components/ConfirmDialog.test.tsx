import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ConfirmDialog from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('supports Escape, backdrop cancel, and custom labels', () => {
    const onCancel = vi.fn()
    const { rerender } = render(
      <ConfirmDialog
        open
        loading={false}
        title="Discard draft?"
        description="Unsaved content"
        confirmLabel="Discard"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Discard draft?' })).toHaveTextContent('Unsaved content')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onCancel).toHaveBeenCalledTimes(2)
    rerender(<ConfirmDialog open={false} loading={false} onConfirm={vi.fn()} onCancel={onCancel} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('prevents cancellation while loading and traps forward/backward Tab', async () => {
    const onCancel = vi.fn()
    const { rerender } = render(
      <ConfirmDialog open loading onConfirm={vi.fn()} onCancel={onCancel} />,
    )
    const dialog = screen.getByRole('dialog')
    const focusTarget = dialog.querySelector<HTMLElement>('.nv-dialog')
    const buttons = screen.getAllByRole('button')
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(dialog)
    expect(onCancel).not.toHaveBeenCalled()
    expect(buttons[0]).toBeDisabled()
    await waitFor(() => expect(focusTarget).toHaveFocus())
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(focusTarget).toHaveFocus()

    // Re-render enabled to exercise both ends of the focus trap.
    rerender(<ConfirmDialog open loading={false} onConfirm={vi.fn()} onCancel={onCancel} />)
    const enabled = screen.getAllByRole('button').filter((button) => !button.hasAttribute('disabled'))
    enabled[enabled.length - 1].focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    enabled[0].focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
  })

  it('restores focus to the connected trigger after closing', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open dialog'
    document.body.append(trigger)
    trigger.focus()
    const { rerender } = render(
      <ConfirmDialog open loading={false} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )

    rerender(<ConfirmDialog open={false} loading={false} onConfirm={vi.fn()} onCancel={vi.fn()} />)

    await waitFor(() => expect(trigger).toHaveFocus())
    trigger.remove()
  })

  it('uses fallback focus when the original trigger becomes disabled', async () => {
    const trigger = document.createElement('button')
    const fallback = document.createElement('textarea')
    document.body.append(trigger, fallback)
    trigger.focus()
    const { rerender } = render(
      <ConfirmDialog
        open
        loading={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        returnFocus={trigger}
        fallbackFocus={fallback}
      />,
    )

    trigger.disabled = true
    rerender(
      <ConfirmDialog
        open={false}
        loading={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        returnFocus={trigger}
        fallbackFocus={fallback}
      />,
    )

    await waitFor(() => expect(fallback).toHaveFocus())
    trigger.remove()
    fallback.remove()
  })
})
