import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import AiFormatReviewDialog from './AiFormatReviewDialog'

describe('AiFormatReviewDialog', () => {
  it('shows both Markdown versions and invokes each review action', () => {
    const onApply = vi.fn()
    const onSaveOriginal = vi.fn()
    const onCancel = vi.fn()
    render(
      <AiFormatReviewDialog
        state={{ kind: 'review', originalText: '#Old', formattedText: '# Old' }}
        loadingAction={null}
        onApply={onApply}
        onSaveOriginal={onSaveOriginal}
        onRetry={vi.fn()}
        onCancel={onCancel}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Review AI formatting' })
    const description = document.getElementById(dialog.getAttribute('aria-describedby') ?? '')
    expect(description).toHaveTextContent('Compare the original and AI-formatted Markdown')
    expect(description).not.toHaveTextContent('#Old')
    expect(within(dialog).getByLabelText('Original Markdown')).toHaveTextContent('#Old')
    expect(within(dialog).getByLabelText('Formatted Markdown')).toHaveTextContent('# Old')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply & Save' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Original' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(onApply).toHaveBeenCalledOnce()
    expect(onSaveOriginal).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('renders the sanitized failure and retry action', () => {
    const onRetry = vi.fn()
    render(
      <AiFormatReviewDialog
        state={{ kind: 'error', originalText: 'Draft', error: 'AI request timed out' }}
        loadingAction={null}
        onApply={vi.fn()}
        onSaveOriginal={vi.fn()}
        onRetry={onRetry}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('AI request timed out')
    fireEvent.click(screen.getByRole('button', { name: 'Retry AI formatting' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('locks every action while saving the original', () => {
    render(
      <AiFormatReviewDialog
        state={{ kind: 'error', originalText: 'Draft', error: 'Unavailable' }}
        loadingAction="original"
        onApply={vi.fn()}
        onSaveOriginal={vi.fn()}
        onRetry={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Saving original…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Retry AI formatting' })).toBeDisabled()
  })
})
