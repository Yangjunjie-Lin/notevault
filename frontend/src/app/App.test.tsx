import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { aiApi } from '../features/ai/api'
import { logout, signInWithGoogle, subscribeToAuth } from '../features/auth/firebase'
import { notesApi } from '../features/notes/api'
import type { Note, NotesResponse } from '../features/notes/types'
import App from './App'

vi.mock('../features/auth/firebase', () => ({
  authReady: true,
  firebaseConfigError: '',
  logout: vi.fn(),
  signInWithGoogle: vi.fn(),
  subscribeToAuth: vi.fn(),
}))

vi.mock('../features/notes/api', () => ({
  notesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../features/ai/api', () => ({
  aiApi: {
    formatMarkdown: vi.fn(),
    reviseNote: vi.fn(),
  },
}))

const user = {
  uid: 'user-1',
  displayName: 'Test User',
  email: 'test@example.com',
  photoURL: null,
}

const note: Note = {
  id: 'note-1',
  text: '# Hello NoteVault',
  tags: ['work'],
  createdAt: 1710000000000,
  updatedAt: null,
}

const secondNote: Note = {
  id: 'note-2',
  text: 'Second note',
  tags: ['ideas'],
  createdAt: 1700000000000,
  updatedAt: null,
}

const thirdNote: Note = {
  id: 'note-3',
  text: 'Third note',
  tags: ['pages'],
  createdAt: 1690000000000,
  updatedAt: null,
}

function response(notes: Note[], overrides: Partial<NotesResponse> = {}): NotesResponse {
  return { notes, hasMore: false, nextCursor: null, searchLimited: false, ...overrides }
}

function authenticate(currentUser: typeof user | null = user) {
  vi.mocked(subscribeToAuth).mockImplementation((next) => {
    next(currentUser)
    return vi.fn()
  })
}

async function renderWorkspace() {
  render(<App />)
  await screen.findByText('Hello NoteVault')
}

describe('NoteVault workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticate()
    vi.mocked(notesApi.list).mockResolvedValue(response([note]))
    vi.mocked(notesApi.create).mockResolvedValue({
      note: { ...secondNote, text: 'A new note', createdAt: 1710000001000 },
    })
    vi.mocked(notesApi.update).mockResolvedValue({
      note: { ...note, text: 'Updated note', tags: ['updated'], updatedAt: 1710000002000 },
    })
    vi.mocked(notesApi.delete).mockResolvedValue({ ok: true })
    vi.mocked(aiApi.formatMarkdown).mockImplementation(async ({ text }) => ({
      text,
      changed: false,
      model: 'deepseek-ai/DeepSeek-V4-Flash',
      traceId: null,
    }))
    vi.mocked(aiApi.reviseNote).mockResolvedValue({
      text: 'AI revised note',
      model: 'deepseek-ai/DeepSeek-V4-Flash',
      traceId: null,
    })
  })

  it('loads the workspace and switches between Markdown write and preview', async () => {
    await renderWorkspace()
    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), { target: { value: '## Preview title' } })
    fireEvent.click(screen.getByRole('tab', { name: /preview/i }))
    expect(screen.getByRole('heading', { name: 'Preview title' })).toBeInTheDocument()
  })

  it('creates a normalized-tag note and clears the successful draft', async () => {
    await renderWorkspace()
    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), { target: { value: 'A new note' } })
    fireEvent.change(screen.getByPlaceholderText(/comma-separated/i), { target: { value: 'Work, Ideas, work' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))

    await waitFor(() => expect(notesApi.create).toHaveBeenCalledWith({ text: 'A new note', tags: ['work', 'ideas'] }))
    expect(screen.getByLabelText('Note body (Markdown)')).toHaveValue('')
    expect(screen.getByRole('status')).toHaveTextContent('Note created.')
  })

  it('applies search, clear, and note-tag filters while resetting the page query', async () => {
    await renderWorkspace()
    fireEvent.change(screen.getByPlaceholderText('Search notes'), { target: { value: 'hello' } })
    fireEvent.change(screen.getByPlaceholderText('Filter by tag'), { target: { value: 'WORK' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => expect(notesApi.list).toHaveBeenLastCalledWith(
      { q: 'hello', tag: 'work', limit: 20 }, expect.any(AbortSignal),
    ))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(notesApi.list).toHaveBeenLastCalledWith(
      { q: '', tag: '', limit: 20 }, expect.any(AbortSignal),
    ))
    fireEvent.click(screen.getByRole('button', { name: 'Filter notes by work' }))
    await waitFor(() => expect(notesApi.list).toHaveBeenLastCalledWith(
      { q: '', tag: 'work', limit: 20 }, expect.any(AbortSignal),
    ))
  })

  it('enters edit mode with exact content/tags and updates the correct card', async () => {
    await renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: /edit note from/i }))
    expect(screen.getByLabelText('Note body (Markdown)')).toHaveValue('# Hello NoteVault')
    expect(screen.getByPlaceholderText(/comma-separated/i)).toHaveValue('work')
    expect(screen.getByText('Edit note')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), { target: { value: 'Updated note' } })
    fireEvent.change(screen.getByPlaceholderText(/comma-separated/i), { target: { value: 'Updated, Work' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(notesApi.update).toHaveBeenCalledWith('note-1', {
      text: 'Updated note', tags: ['updated', 'work'],
    }))
    expect(await screen.findByText('Updated note')).toBeInTheDocument()
    expect(screen.getByText(/Updated .*2024/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument()
  })

  it('preserves the edit draft when update fails', async () => {
    vi.mocked(notesApi.update).mockRejectedValueOnce(new Error('Update unavailable'))
    await renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: /edit note from/i }))
    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), { target: { value: 'Unsaved exact draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Update unavailable')
    expect(screen.getByLabelText('Note body (Markdown)')).toHaveValue('Unsaved exact draft')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('returns to create mode when a clean edit is cancelled', async () => {
    await renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: /edit note from/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument()
    expect(screen.getByLabelText('Note body (Markdown)')).toHaveValue('')
  })

  it('confirms before cancelling a dirty edit', async () => {
    await renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: /edit note from/i }))
    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), { target: { value: 'Dirty draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }))

    expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('Note body (Markdown)')).toHaveValue('Dirty draft')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument()
  })

  it('confirms dirty content before switching notes or signing out', async () => {
    vi.mocked(notesApi.list).mockResolvedValue(response([note, secondNote]))
    await renderWorkspace()
    const editButtons = screen.getAllByRole('button', { name: /edit note from/i })
    fireEvent.click(editButtons[0])
    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), { target: { value: 'Dirty draft' } })
    fireEvent.click(editButtons[1])
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.getByLabelText('Note body (Markdown)')).toHaveValue('Second note')

    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), { target: { value: 'Dirty second' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(logout).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(logout).toHaveBeenCalledOnce())
  })

  it('removes an edited note that no longer matches the active filter', async () => {
    await renderWorkspace()
    fireEvent.change(screen.getByPlaceholderText('Search notes'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByText('Hello NoteVault')
    vi.mocked(notesApi.update).mockResolvedValueOnce({
      note: { ...note, text: 'No longer matches', updatedAt: 1710000002000 },
    })
    fireEvent.click(screen.getByRole('button', { name: /edit note from/i }))
    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), { target: { value: 'No longer matches' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.queryByText('No longer matches')).not.toBeInTheDocument())
  })

  it('keeps a matching edited note visible', async () => {
    await renderWorkspace()
    fireEvent.change(screen.getByPlaceholderText('Search notes'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    vi.mocked(notesApi.update).mockResolvedValueOnce({
      note: { ...note, text: 'Hello updated', updatedAt: 1710000002000 },
    })
    fireEvent.click(await screen.findByRole('button', { name: /edit note from/i }))
    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), { target: { value: 'Hello updated' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Hello updated')).toBeInTheDocument()
  })

  it('appends pages, deduplicates IDs, and keeps loaded notes after a pagination error', async () => {
    vi.mocked(notesApi.list)
      .mockResolvedValueOnce(response([note], { hasMore: true, nextCursor: 'cursor-1' }))
      .mockResolvedValueOnce(response([note, secondNote]))
    await renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Second note')).toBeInTheDocument()
    expect(screen.getAllByText('Hello NoteVault')).toHaveLength(1)

    vi.mocked(notesApi.list)
      .mockReset()
      .mockResolvedValueOnce(response([note], { hasMore: true, nextCursor: 'cursor-2' }))
      .mockRejectedValueOnce(new Error('Next page unavailable'))
    render(<App />)
    await screen.findAllByText('Hello NoteVault')
    const loadButtons = screen.getAllByRole('button', { name: 'Load more' })
    fireEvent.click(loadButtons[loadButtons.length - 1])
    expect(await screen.findByText('Next page unavailable')).toBeInTheDocument()
    expect(screen.getAllByText('Hello NoteVault').length).toBeGreaterThan(0)
  })

  it('deletes the last loaded boundary note and still loads the next page', async () => {
    vi.mocked(notesApi.list)
      .mockResolvedValueOnce(response([note, secondNote], { hasMore: true, nextCursor: 'boundary-cursor' }))
      .mockResolvedValueOnce(response([thirdNote]))
    await renderWorkspace()

    const boundaryCard = screen.getByText('Second note').closest('li')
    expect(boundaryCard).not.toBeNull()
    fireEvent.click(within(boundaryCard as HTMLElement).getByRole('button', { name: /delete note from/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }))
    await waitFor(() => expect(screen.queryByText('Second note')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Third note')).toBeInTheDocument()
    expect(screen.getByText('Hello NoteVault')).toBeInTheDocument()
  })

  it('deletes a non-boundary note without losing the next-page continuation', async () => {
    vi.mocked(notesApi.list)
      .mockResolvedValueOnce(response([note, secondNote], { hasMore: true, nextCursor: 'stable-cursor' }))
      .mockResolvedValueOnce(response([thirdNote]))
    await renderWorkspace()

    const firstCard = screen.getByText('Hello NoteVault').closest('li')
    expect(firstCard).not.toBeNull()
    fireEvent.click(within(firstCard as HTMLElement).getByRole('button', { name: /delete note from/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }))
    await waitFor(() => expect(screen.queryByText('Hello NoteVault')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Third note')).toBeInTheDocument()
    expect(screen.getByText('Second note')).toBeInTheDocument()
  })

  it('merges a created note at the top and never duplicates an existing ID', async () => {
    vi.mocked(notesApi.list).mockResolvedValue(response([note, secondNote]))
    vi.mocked(notesApi.create).mockResolvedValueOnce({
      note: { ...thirdNote, text: 'Newest created note', createdAt: 1720000000000 },
    })
    await renderWorkspace()

    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), { target: { value: 'Newest created note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await screen.findByText('Newest created note')

    let cards = screen.getAllByRole('listitem')
    expect(within(cards[0]).getByText('Newest created note')).toBeInTheDocument()

    vi.mocked(notesApi.create).mockResolvedValueOnce({ note: { ...note, text: 'Same ID replacement' } })
    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), { target: { value: 'Same ID replacement' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await screen.findByText('Same ID replacement')
    cards = screen.getAllByRole('listitem')
    expect(cards).toHaveLength(3)
    expect(screen.queryByText('Hello NoteVault')).not.toBeInTheDocument()
  })

  it('keeps an updated note in stable createdAt order', async () => {
    vi.mocked(notesApi.list).mockResolvedValue(response([note, secondNote]))
    vi.mocked(notesApi.update).mockResolvedValueOnce({
      note: { ...secondNote, text: 'Edited older note', updatedAt: 1710000002000 },
    })
    await renderWorkspace()

    const olderCard = screen.getByText('Second note').closest('li')
    expect(olderCard).not.toBeNull()
    fireEvent.click(within(olderCard as HTMLElement).getByRole('button', { name: /edit note from/i }))
    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), { target: { value: 'Edited older note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Edited older note')

    const cards = screen.getAllByRole('listitem')
    expect(within(cards[0]).getByText('Hello NoteVault')).toBeInTheDocument()
    expect(within(cards[1]).getByText('Edited older note')).toBeInTheDocument()
  })

  it('ignores a stale pagination response after filters change', async () => {
    let resolvePage!: (value: NotesResponse) => void
    const stalePage = new Promise<NotesResponse>((resolve) => { resolvePage = resolve })
    vi.mocked(notesApi.list).mockImplementation((query) => {
      if (query.cursor) return stalePage
      if (query.q === 'fresh') return Promise.resolve(response([secondNote]))
      return Promise.resolve(response([note], { hasMore: true, nextCursor: 'cursor' }))
    })
    await renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    fireEvent.change(screen.getByPlaceholderText('Search notes'), { target: { value: 'fresh' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('Second note')).toBeInTheDocument()
    resolvePage(response([{ ...note, id: 'stale', text: 'Stale page' }]))
    await waitFor(() => expect(screen.queryByText('Stale page')).not.toBeInTheDocument())
  })

  it('requires confirmation before deleting and supports cancel/confirm', async () => {
    await renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: /delete note from/i }))
    expect(screen.getByRole('dialog', { name: 'Delete this note?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(notesApi.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /delete note from/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }))
    await waitFor(() => expect(notesApi.delete).toHaveBeenCalledWith('note-1'))
    expect(screen.queryByText('Hello NoteVault')).not.toBeInTheDocument()
  })

  it('dismisses API errors without losing the workspace', async () => {
    vi.mocked(notesApi.list).mockRejectedValueOnce(new Error('Service unavailable'))
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error notification' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Notes workspace' })).toBeInTheDocument()
  })

  it('reviews changed AI formatting and applies it without changing tags', async () => {
    vi.mocked(aiApi.formatMarkdown).mockResolvedValueOnce({
      text: '# Formatted note\n\n- item',
      changed: true,
      model: 'deepseek-ai/DeepSeek-V4-Flash',
      traceId: 'trace-test',
    })
    await renderWorkspace()
    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), {
      target: { value: '#Formatted note\n-item' },
    })
    fireEvent.change(screen.getByPlaceholderText(/comma-separated/i), {
      target: { value: 'Work, Ideas' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))

    const dialog = await screen.findByRole('dialog', { name: 'Review AI formatting' })
    expect(within(dialog).getByLabelText('Original Markdown')).toHaveTextContent('#Formatted note')
    expect(within(dialog).getByLabelText('Formatted Markdown')).toHaveTextContent('# Formatted note')
    expect(notesApi.create).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply & Save' }))

    await waitFor(() => expect(notesApi.create).toHaveBeenCalledWith({
      text: '# Formatted note\n\n- item',
      tags: ['work', 'ideas'],
    }))
    expect(screen.getByLabelText('Note body (Markdown)')).toHaveValue('')
  })

  it('can cancel formatting review or save the exact original draft', async () => {
    vi.mocked(aiApi.formatMarkdown).mockResolvedValue({
      text: 'Formatted draft',
      changed: true,
      model: 'deepseek-ai/DeepSeek-V4-Flash',
      traceId: null,
    })
    await renderWorkspace()
    const body = screen.getByLabelText('Note body (Markdown)')
    fireEvent.change(body, { target: { value: 'Original draft' } })
    const saveButton = screen.getByRole('button', { name: 'Add note' })
    fireEvent.click(saveButton)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(body).toHaveValue('Original draft')
    expect(notesApi.create).not.toHaveBeenCalled()
    await waitFor(() => expect(saveButton).toHaveFocus())

    fireEvent.click(saveButton)
    const dialog = await screen.findByRole('dialog', { name: 'Review AI formatting' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Original' }))
    await waitFor(() => expect(notesApi.create).toHaveBeenCalledWith({
      text: 'Original draft', tags: [],
    }))
  })

  it('preserves a draft after formatting failure and supports retry', async () => {
    vi.mocked(aiApi.formatMarkdown)
      .mockRejectedValueOnce(new Error('AI service is temporarily unavailable'))
      .mockImplementationOnce(async ({ text }) => ({
        text,
        changed: false,
        model: 'deepseek-ai/DeepSeek-V4-Flash',
        traceId: null,
      }))
    await renderWorkspace()
    const body = screen.getByLabelText('Note body (Markdown)')
    fireEvent.change(body, { target: { value: 'Failure-safe draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))

    const dialog = await screen.findByRole('dialog', { name: 'AI formatting unavailable' })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('temporarily unavailable')
    expect(body).toHaveValue('Failure-safe draft')
    expect(notesApi.create).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry AI formatting' }))
    await waitFor(() => expect(notesApi.create).toHaveBeenCalledWith({
      text: 'Failure-safe draft', tags: [],
    }))
  })

  it('falls back to saving the original after formatting failure', async () => {
    vi.mocked(aiApi.formatMarkdown).mockRejectedValueOnce(new Error('Formatting timed out'))
    await renderWorkspace()
    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), {
      target: { value: 'Keep this exact draft' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    const dialog = await screen.findByRole('dialog', { name: 'AI formatting unavailable' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Original' }))
    await waitFor(() => expect(notesApi.create).toHaveBeenCalledWith({
      text: 'Keep this exact draft', tags: [],
    }))
  })

  it('keeps an AI Assist revision separate until Apply to draft', async () => {
    vi.mocked(aiApi.reviseNote)
      .mockResolvedValueOnce({
        text: '## Structured note\n\n- First item',
        model: 'deepseek-ai/DeepSeek-V4-Flash',
        traceId: null,
      })
      .mockResolvedValueOnce({
        text: '## Structured note\n\n- [ ] First item',
        model: 'deepseek-ai/DeepSeek-V4-Flash',
        traceId: null,
      })
    await renderWorkspace()
    const body = screen.getByLabelText('Note body (Markdown)')
    fireEvent.change(body, { target: { value: 'First item' } })
    fireEvent.change(screen.getByPlaceholderText(/comma-separated/i), { target: { value: 'Work' } })
    const aiButton = screen.getByRole('button', { name: 'AI Assist' })
    expect(aiButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(aiButton)
    expect(aiButton).toHaveAttribute('aria-expanded', 'true')
    fireEvent.change(screen.getByLabelText('Editing instruction'), {
      target: { value: 'Add a heading and list.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /generate revision/i }))
    expect(await screen.findByRole('heading', { name: 'Structured note' })).toBeInTheDocument()
    expect(body).toHaveValue('First item')
    expect(notesApi.create).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Editing instruction'), {
      target: { value: 'Convert it to a checklist.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /generate revision/i }))
    await waitFor(() => expect(aiApi.reviseNote).toHaveBeenLastCalledWith({
      text: '## Structured note\n\n- First item',
      instruction: 'Convert it to a checklist.',
    }, expect.any(AbortSignal)))
    fireEvent.click(await screen.findByRole('button', { name: 'Apply to draft' }))
    expect(body).toHaveValue('## Structured note\n\n- [ ] First item')
    expect(screen.queryByRole('region', { name: 'AI Assist' })).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/comma-separated/i)).toHaveValue('Work')
    expect(notesApi.create).not.toHaveBeenCalled()
  })

  it('locks an existing AI candidate while the submitted draft is being formatted', async () => {
    let resolveFormat!: (value: Awaited<ReturnType<typeof aiApi.formatMarkdown>>) => void
    vi.mocked(aiApi.reviseNote).mockResolvedValueOnce({
      text: 'AI candidate that must not replace the submitted snapshot',
      model: 'deepseek-ai/DeepSeek-V4-Flash',
      traceId: null,
    })
    vi.mocked(aiApi.formatMarkdown).mockImplementationOnce(() => new Promise((resolve) => {
      resolveFormat = resolve
    }))
    await renderWorkspace()
    const body = screen.getByLabelText('Note body (Markdown)')
    const tagInput = screen.getByPlaceholderText(/comma-separated/i)
    fireEvent.change(body, { target: { value: 'Submitted draft' } })
    fireEvent.change(tagInput, { target: { value: 'Work' } })
    fireEvent.click(screen.getByRole('button', { name: 'AI Assist' }))
    fireEvent.change(screen.getByLabelText('Editing instruction'), { target: { value: 'Revise it.' } })
    fireEvent.click(screen.getByRole('button', { name: /generate revision/i }))
    const applyButton = await screen.findByRole('button', { name: 'Apply to draft' })
    expect(applyButton).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(body).toBeDisabled()
    expect(tagInput).toBeDisabled()
    expect(applyButton).toBeDisabled()
    fireEvent.click(applyButton)
    expect(body).toHaveValue('Submitted draft')

    resolveFormat({
      text: 'Submitted draft',
      changed: false,
      model: 'deepseek-ai/DeepSeek-V4-Flash',
      traceId: null,
    })
    await waitFor(() => expect(notesApi.create).toHaveBeenCalledWith({
      text: 'Submitted draft', tags: ['work'],
    }))
  })

  it('blocks edit, delete, and sign-out modals while formatting is active', async () => {
    let resolveFormat!: (value: Awaited<ReturnType<typeof aiApi.formatMarkdown>>) => void
    vi.mocked(aiApi.formatMarkdown).mockImplementationOnce(() => new Promise((resolve) => {
      resolveFormat = resolve
    }))
    await renderWorkspace()
    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), {
      target: { value: 'Draft being formatted' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))

    const editButton = screen.getByRole('button', { name: /edit note from/i })
    const deleteButton = screen.getByRole('button', { name: /delete note from/i })
    const signOutButton = screen.getByRole('button', { name: 'Sign out' })
    expect(editButton).toBeDisabled()
    expect(deleteButton).toBeDisabled()
    expect(signOutButton).toBeDisabled()
    fireEvent.click(editButton)
    fireEvent.click(deleteButton)
    fireEvent.click(signOutButton)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    resolveFormat({
      text: '# Draft being formatted',
      changed: true,
      model: 'deepseek-ai/DeepSeek-V4-Flash',
      traceId: null,
    })
    const review = await screen.findByRole('dialog', { name: 'Review AI formatting' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(within(review).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(editButton).toBeEnabled())
    expect(deleteButton).toBeEnabled()
    expect(signOutButton).toBeEnabled()
  })

  it('prevents a stale AI candidate from replacing a draft changed during the request', async () => {
    let resolveRevision!: (value: Awaited<ReturnType<typeof aiApi.reviseNote>>) => void
    vi.mocked(aiApi.reviseNote)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRevision = resolve
      }))
      .mockResolvedValueOnce({
        text: 'Candidate based on the newer draft',
        model: 'deepseek-ai/DeepSeek-V4-Flash',
        traceId: null,
      })
    await renderWorkspace()
    const body = screen.getByLabelText('Note body (Markdown)')
    fireEvent.change(body, { target: { value: 'Source draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'AI Assist' }))
    fireEvent.change(screen.getByLabelText('Editing instruction'), { target: { value: 'Improve it.' } })
    fireEvent.click(screen.getByRole('button', { name: /generate revision/i }))
    fireEvent.change(body, { target: { value: 'Newer local draft' } })
    resolveRevision({
      text: 'Stale candidate',
      model: 'deepseek-ai/DeepSeek-V4-Flash',
      traceId: null,
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('draft changed')
    expect(screen.getByRole('button', { name: 'Apply to draft' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
    expect(body).toHaveValue('Newer local draft')

    fireEvent.change(screen.getByLabelText('Editing instruction'), {
      target: { value: 'Regenerate from the current draft.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /generate revision/i }))
    await waitFor(() => expect(aiApi.reviseNote).toHaveBeenLastCalledWith({
      text: 'Newer local draft',
      instruction: 'Regenerate from the current draft.',
    }, expect.any(AbortSignal)))
    const applyButton = await screen.findByRole('button', { name: 'Apply to draft' })
    expect(applyButton).toBeEnabled()
    fireEvent.click(applyButton)
    expect(body).toHaveValue('Candidate based on the newer draft')
  })

  it('aborts an active AI Assist request when the panel closes with Escape', async () => {
    let requestSignal: AbortSignal | undefined
    vi.mocked(aiApi.reviseNote).mockImplementationOnce((_input, signal) => {
      requestSignal = signal
      return new Promise(() => undefined)
    })
    await renderWorkspace()
    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), { target: { value: 'Draft' } })
    const aiButton = screen.getByRole('button', { name: 'AI Assist' })
    fireEvent.click(aiButton)
    fireEvent.change(screen.getByLabelText('Editing instruction'), { target: { value: 'Revise it.' } })
    fireEvent.click(screen.getByRole('button', { name: /generate revision/i }))
    expect(requestSignal?.aborted).toBe(false)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(requestSignal?.aborted).toBe(true)
    expect(screen.queryByLabelText('Editing instruction')).not.toBeInTheDocument()
    await waitFor(() => expect(aiButton).toHaveFocus())
  })
})

describe('NoteVault authentication', () => {
  it('shows the signed-out landing page and signs in', async () => {
    vi.clearAllMocks()
    authenticate(null)
    render(<App />)
    expect(await screen.findByRole('heading', { name: /beautifully private/i })).toBeInTheDocument()
    const button = screen.getByRole('button', { name: /sign in with google/i })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledOnce())
    expect(notesApi.list).not.toHaveBeenCalled()
  })
})
