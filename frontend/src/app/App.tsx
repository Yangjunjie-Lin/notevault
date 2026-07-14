import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'

import AppHeader from '../features/auth/components/AppHeader'
import AuthLanding from '../features/auth/components/AuthLanding'
import { auth, firebaseConfigError, logout, signInWithGoogle } from '../features/auth/firebase'
import EmptyState from '../features/notes/components/EmptyState'
import NoteCard from '../features/notes/components/NoteCard'
import NoteComposer from '../features/notes/components/NoteComposer'
import NotesToolbar from '../features/notes/components/NotesToolbar'
import { notesApi } from '../features/notes/api'
import {
  EMPTY_FILTERS,
  type Note,
  type NoteFilters,
  type NoteInput,
} from '../features/notes/types'
import ConfirmDialog from '../shared/components/ConfirmDialog'
import ErrorBanner from '../shared/components/ErrorBanner'
import LoadingSkeleton from '../shared/components/LoadingSkeleton'
import '../styles/app.css'

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function noteMatchesFilters(note: Note, filters: NoteFilters) {
  const query = filters.q.trim().toLowerCase()
  const tag = filters.tag.trim().toLowerCase()
  const searchable = `${note.text} ${note.tags.join(' ')}`.toLowerCase()

  return (!query || searchable.includes(query)) && (!tag || note.tags.includes(tag))
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authInitializing, setAuthInitializing] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [filters, setFilters] = useState<NoteFilters>(EMPTY_FILTERS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!auth) {
      setError(firebaseConfigError)
      setAuthInitializing(false)
      return undefined
    }

    return onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser)
        setAuthInitializing(false)
        setError('')
        if (!currentUser) {
          setNotes([])
          setFilters(EMPTY_FILTERS)
        }
      },
      (authError) => {
        setError(getErrorMessage(authError, 'Unable to restore your session.'))
        setAuthInitializing(false)
      },
    )
  }, [])

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return undefined
    }

    const controller = new AbortController()
    setLoading(true)
    setError('')

    notesApi.list(filters, controller.signal)
      .then(({ notes: nextNotes }) => setNotes(nextNotes))
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return
        setError(getErrorMessage(loadError, 'Failed to load notes.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [user, filters])

  async function handleSignIn() {
    if (authBusy) return
    setAuthBusy(true)
    setError('')
    try {
      await signInWithGoogle()
    } catch (signInError) {
      setError(getErrorMessage(signInError, 'Sign-in failed.'))
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleSignOut() {
    if (authBusy) return
    setAuthBusy(true)
    setError('')
    try {
      await logout()
    } catch (signOutError) {
      setError(getErrorMessage(signOutError, 'Sign-out failed.'))
    } finally {
      setAuthBusy(false)
    }
  }

  async function addNote(input: NoteInput) {
    setSaving(true)
    setError('')
    try {
      const { note } = await notesApi.create(input)
      if (noteMatchesFilters(note, filters)) {
        setNotes((current) => [note, ...current])
      }
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Failed to save note.'))
      throw saveError
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!confirmId) return

    const id = confirmId
    setDeleting(true)
    setError('')
    try {
      await notesApi.delete(id)
      setNotes((current) => current.filter((note) => note.id !== id))
      setConfirmId(null)
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Failed to delete note.'))
    } finally {
      setDeleting(false)
    }
  }

  const hasFilters = Boolean(filters.q || filters.tag)

  return (
    <div className="nv-app">
      <a href="#main-content" className="nv-skip-link">Skip to main content</a>

      <AppHeader
        user={user}
        authReady={Boolean(auth) && !authInitializing}
        authBusy={authBusy}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

      {authInitializing ? (
        <main id="main-content" className="nv-auth-loading" aria-busy="true">
          <span className="nv-spinner" aria-hidden="true" />
          <span>Restoring your private workspace…</span>
        </main>
      ) : user ? (
        <main id="main-content" className="nv-workspace" tabIndex={-1} aria-label="Notes workspace">
          <NoteComposer onAdd={addNote} loading={saving} />

          <section className="nv-panel nv-col-right" aria-label="Your notes">
            <div className="nv-notes-header">
              <h1 className="nv-panel-label">Your notes</h1>
              {!loading && (
                <span className="nv-notes-count" aria-live="polite">
                  {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                </span>
              )}
            </div>

            <NotesToolbar filters={filters} onChange={setFilters} loading={loading} />

            {loading ? (
              <LoadingSkeleton />
            ) : notes.length === 0 ? (
              <EmptyState hasFilters={hasFilters} onClearFilters={() => setFilters(EMPTY_FILTERS)} />
            ) : (
              <ul className="nv-note-list" aria-label="Notes" aria-live="polite" aria-relevant="additions removals">
                {notes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onDelete={setConfirmId}
                    onTagSelect={(tag) => setFilters({ q: '', tag })}
                  />
                ))}
              </ul>
            )}
          </section>
        </main>
      ) : (
        <AuthLanding authReady={Boolean(auth)} authBusy={authBusy} onSignIn={handleSignIn} />
      )}

      <ConfirmDialog
        open={confirmId !== null}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => { if (!deleting) setConfirmId(null) }}
      />
    </div>
  )
}
