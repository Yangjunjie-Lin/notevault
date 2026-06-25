import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { api } from './api'

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((auth, callback) => {
    callback({ uid: 'user-1', displayName: 'Test User' })
    return vi.fn()
  }),
}))

vi.mock('./firebase', () => ({
  auth: {},
  firebaseConfigError: '',
  logout: vi.fn(),
  signInWithGoogle: vi.fn(),
}))

vi.mock('./api', () => ({
  api: {
    getNotes: vi.fn(),
    addNote: vi.fn(),
    deleteNote: vi.fn(),
  },
}))

describe('App smoke test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getNotes.mockResolvedValue({
      notes: [
        {
          id: 'note-1',
          text: '# Hello NoteVault',
          tags: ['work'],
          createdAt: 1710000000000,
        },
      ],
    })
  })

  it('renders the authenticated notes workspace', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'NoteVault' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search notes')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Hello NoteVault')).toBeInTheDocument()
      expect(screen.getByText('work')).toBeInTheDocument()
    })
  })
})
