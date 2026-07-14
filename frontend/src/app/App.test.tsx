import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { onAuthStateChanged } from 'firebase/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { notesApi } from '../features/notes/api'
import { logout, signInWithGoogle } from '../features/auth/firebase'
import App from './App'

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}))

vi.mock('../features/auth/firebase', () => ({
  auth: {},
  firebaseConfigError: '',
  logout: vi.fn(),
  signInWithGoogle: vi.fn(),
}))

vi.mock('../features/notes/api', () => ({
  notesApi: {
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}))

const user = {
  uid: 'user-1',
  displayName: 'Test User',
  email: 'test@example.com',
  photoURL: null,
}

const note = {
  id: 'note-1',
  text: '# Hello NoteVault',
  tags: ['work'],
  createdAt: 1710000000000,
}

describe('NoteVault workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(onAuthStateChanged).mockImplementation(((_auth, next) => {
      if (typeof next === 'function') next(user as never)
      return vi.fn()
    }) as typeof onAuthStateChanged)
    vi.mocked(notesApi.list).mockResolvedValue({ notes: [note] })
    vi.mocked(notesApi.create).mockResolvedValue({
      note: { ...note, id: 'note-2', text: 'A new note', createdAt: 1710000001000 },
    })
    vi.mocked(notesApi.delete).mockResolvedValue({ ok: true })
  })

  it('loads the authenticated workspace and switches between write and preview', async () => {
    render(<App />)

    expect(await screen.findByText('Hello NoteVault')).toBeInTheDocument()
    const editor = screen.getByLabelText('Note body (Markdown)')
    fireEvent.change(editor, { target: { value: '## Preview title' } })
    fireEvent.click(screen.getByRole('tab', { name: /preview/i }))

    expect(screen.getByRole('heading', { name: 'Preview title' })).toBeInTheDocument()
  })

  it('creates a note and clears the successful draft', async () => {
    render(<App />)
    await screen.findByText('Hello NoteVault')

    fireEvent.change(screen.getByLabelText('Note body (Markdown)'), {
      target: { value: 'A new note' },
    })
    fireEvent.change(screen.getByPlaceholderText(/comma-separated/i), {
      target: { value: 'Work, Ideas, work' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))

    await waitFor(() => {
      expect(notesApi.create).toHaveBeenCalledWith({
        text: 'A new note',
        tags: ['work', 'ideas'],
      })
    })
    expect(screen.getByLabelText('Note body (Markdown)')).toHaveValue('')
  })

  it('applies, clears, and selects tag filters', async () => {
    render(<App />)
    await screen.findByText('Hello NoteVault')

    fireEvent.change(screen.getByPlaceholderText('Search notes'), { target: { value: 'hello' } })
    fireEvent.change(screen.getByPlaceholderText('Filter by tag'), { target: { value: 'WORK' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(notesApi.list).toHaveBeenLastCalledWith(
        { q: 'hello', tag: 'work' },
        expect.any(AbortSignal),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search notes')).toHaveValue('')
      expect(screen.getByPlaceholderText('Filter by tag')).toHaveValue('')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Filter notes by work' }))
    await waitFor(() => {
      expect(notesApi.list).toHaveBeenLastCalledWith(
        { q: '', tag: 'work' },
        expect.any(AbortSignal),
      )
    })
  })

  it('requires confirmation before deleting a note', async () => {
    render(<App />)
    await screen.findByText('Hello NoteVault')

    fireEvent.click(screen.getByRole('button', { name: /delete note from/i }))
    expect(screen.getByRole('dialog', { name: 'Delete this note?' })).toBeInTheDocument()
    expect(notesApi.delete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(notesApi.delete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /delete note from/i }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }))
    await waitFor(() => expect(notesApi.delete).toHaveBeenCalledWith('note-1'))
    expect(screen.queryByText('Hello NoteVault')).not.toBeInTheDocument()
  })

  it('signs out from the account navigation', async () => {
    render(<App />)
    await screen.findByText('Hello NoteVault')

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(logout).toHaveBeenCalledOnce())
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
  it('shows the sign-in landing page for signed-out users', async () => {
    vi.clearAllMocks()
    vi.mocked(onAuthStateChanged).mockImplementation(((_auth, next) => {
      if (typeof next === 'function') next(null)
      return vi.fn()
    }) as typeof onAuthStateChanged)

    render(<App />)

    expect(await screen.findByRole('heading', { name: /beautifully private/i })).toBeInTheDocument()
    const signInButton = screen.getByRole('button', { name: /sign in with google/i })
    expect(signInButton).toBeEnabled()
    expect(notesApi.list).not.toHaveBeenCalled()

    fireEvent.click(signInButton)
    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledOnce())
  })
})
