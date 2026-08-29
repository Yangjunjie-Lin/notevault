import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CaptureSuggestion } from '../types'
import CaptureReviewDialog from './CaptureReviewDialog'

const suggestions: CaptureSuggestion[] = [
  { id: 'one', kind: 'note', title: 'Useful summary', content: 'A grounded summary.' },
  { id: 'two', kind: 'checkpoint', title: 'Test the idea', content: 'Run a prototype.' },
]

describe('CaptureReviewDialog', () => {
  it('selects nothing by default and saves only checked, editable items', () => {
    const onSave = vi.fn()
    render(
      <CaptureReviewDialog
        open
        suggestions={suggestions}
        loading={false}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    )

    const save = screen.getByRole('button', { name: 'Save selected (0)' })
    expect(save).toBeDisabled()
    expect(screen.getByLabelText('Include candidate 1')).not.toBeChecked()

    fireEvent.click(screen.getByLabelText('Include candidate 1'))
    fireEvent.change(screen.getAllByDisplayValue('Note')[0], { target: { value: 'checkpoint' } })
    fireEvent.change(screen.getByDisplayValue('Useful summary'), { target: { value: '  Confirm scope  ' } })
    fireEvent.change(screen.getByDisplayValue('A grounded summary.'), { target: { value: '  Check the scope.  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save selected (1)' }))

    expect(onSave).toHaveBeenCalledWith([{
      kind: 'checkpoint',
      title: 'Confirm scope',
      content: 'Check the scope.',
    }])
  })

  it('blocks incomplete selected items and allows cancellation', () => {
    const onCancel = vi.fn()
    render(
      <CaptureReviewDialog
        open
        suggestions={suggestions}
        loading={false}
        onCancel={onCancel}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('Include candidate 2'))
    fireEvent.change(screen.getByDisplayValue('Test the idea'), { target: { value: ' ' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Every selected item needs both a title and content.')
    expect(screen.getByRole('button', { name: 'Save selected (0)' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Keep reviewing later' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('renders a controlled empty state', () => {
    render(
      <CaptureReviewDialog
        open
        suggestions={[]}
        loading={false}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByText(/No useful notes or checkpoints/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save selected (0)' })).toBeDisabled()
  })
})
