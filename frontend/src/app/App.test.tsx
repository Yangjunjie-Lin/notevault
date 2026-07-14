import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
