import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import AiAssistPanel from './AiAssistPanel'

function props(overrides: Partial<React.ComponentProps<typeof AiAssistPanel>> = {}) {
  return {
    instruction: 'Make this concise.',
    messages: [],
    candidateText: '',
    requesting: false,
    error: '',
    draftConflict: false,
    candidateTooLong: false,
    canApply: false,
    locked: false,
    onInstructionChange: vi.fn(),
    onGenerate: vi.fn(),
    onTryAgain: vi.fn(),
    onDiscard: vi.fn(),
    onApply: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

describe('AiAssistPanel', () => {
  it('exposes the disclosure, instruction control, and loading state', () => {
    const onInstructionChange = vi.fn()
    const onGenerate = vi.fn()
    render(<AiAssistPanel {...props({ requesting: true, onInstructionChange, onGenerate })} />)

    const panel = screen.getByRole('region', { name: 'AI Assist' })
    expect(panel).toHaveAttribute('aria-busy', 'true')
    expect(within(panel).getByText(/sent to SiliconFlow/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Editing instruction')).toBeDisabled()
    expect(screen.getByRole('button', { name: /generating revision/i })).toBeDisabled()
  })

  it('renders safe preview/source and all candidate actions', () => {
    const onApply = vi.fn()
    const onDiscard = vi.fn()
    const onTryAgain = vi.fn()
    render(<AiAssistPanel {...props({
      candidateText: '# Candidate\n\n- item',
      canApply: true,
      messages: [{ id: 1, instruction: 'Structure it.' }],
      onApply,
      onDiscard,
      onTryAgain,
    })} />)

    expect(screen.getByRole('heading', { name: 'Candidate' })).toBeInTheDocument()
    expect(screen.getByText('Structure it.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'View source' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('# Candidate')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply to draft' }))
    expect(onTryAgain).toHaveBeenCalledOnce()
    expect(onDiscard).toHaveBeenCalledOnce()
    expect(onApply).toHaveBeenCalledOnce()
  })

  it('blocks overlong or conflicted candidates and closes with Escape', () => {
    const onClose = vi.fn()
    render(<AiAssistPanel {...props({
      candidateText: 'Candidate',
      canApply: false,
      candidateTooLong: true,
      draftConflict: true,
      error: 'A less important error',
      onClose,
    })} />)

    expect(screen.getByRole('alert')).toHaveTextContent('draft changed')
    expect(screen.getByRole('button', { name: 'Apply to draft' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('reports instruction edits and disables generation for blank input', () => {
    const onInstructionChange = vi.fn()
    const { rerender } = render(<AiAssistPanel {...props({
      instruction: '',
      onInstructionChange,
    })} />)
    expect(screen.getByRole('button', { name: /generate revision/i })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Editing instruction'), { target: { value: 'Revise.' } })
    expect(onInstructionChange).toHaveBeenCalledWith('Revise.')

    rerender(<AiAssistPanel {...props({ instruction: 'x'.repeat(1001) })} />)
    expect(screen.getByLabelText('Editing instruction')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: /generate revision/i })).toBeDisabled()
  })

  it('locks all draft-changing actions while save formatting is active', () => {
    render(<AiAssistPanel {...props({
      candidateText: 'Candidate',
      canApply: true,
      locked: true,
    })} />)

    expect(screen.getByLabelText('Editing instruction')).toBeDisabled()
    expect(screen.getByRole('button', { name: /generate revision/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Apply to draft' })).toBeDisabled()
  })
})
