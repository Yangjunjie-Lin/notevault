import { useCallback, useEffect, useState } from 'react'

import AppHeader from '../features/auth/components/AppHeader'
import AuthLanding from '../features/auth/components/AuthLanding'
import {
  authReady,
  firebaseConfigError,
  logout,
  signInWithGoogle,
  subscribeToAuth,
  type AuthUser,
} from '../features/auth/firebase'
import EmptyState from '../features/notes/components/EmptyState'
import NoteCard from '../features/notes/components/NoteCard'
import NoteComposer from '../features/notes/components/NoteComposer'
import NotesToolbar from '../features/notes/components/NotesToolbar'
import useNotes from '../features/notes/hooks/useNotes'
import { EMPTY_FILTERS, type Note, type NoteFilters, type NoteInput } from '../features/notes/types'
import ConfirmDialog from '../shared/components/ConfirmDialog'
import ErrorBanner from '../shared/components/ErrorBanner'
import LoadingSkeleton from '../shared/components/LoadingSkeleton'
import '../styles/app.css'

type PendingDiscard =
  | { kind: 'cancel' }
  | { kind: 'edit'; note: Note }
  | { kind: 'signout' }

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authInitializing, setAuthInitializing] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [filters, setFilters] = useState<NoteFilters>(EMPTY_FILTERS)
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [pendingDiscard, setPendingDiscard] = useState<PendingDiscard | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const workspace = useNotes(user?.uid ?? null, filters)

  useEffect(() => subscribeToAuth(
    (currentUser) => {
      setUser(currentUser)
      setAuthInitializing(false)
      setAuthError('')
      if (!currentUser) {
        setFilters(EMPTY_FILTERS)
        setEditingNote(null)
        setDirty(false)
      }
    },
    (error) => {
      setAuthError(getErrorMessage(error, firebaseConfigError || 'Unable to restore your session.'))
      setAuthInitializing(false)
    },
  ), [])

  useEffect(() => {
    if (!statusMessage) return undefined
    const id = window.setTimeout(() => setStatusMessage(''), 4000)
    return () => window.clearTimeout(id)
  }, [statusMessage])

  const handleDirtyChange = useCallback((nextDirty: boolean) => setDirty(nextDirty), [])

  async function handleSignIn() {
    if (authBusy) return
    setAuthBusy(true)
    setAuthError('')
    try {
      await signInWithGoogle()
    } catch (error) {
      setAuthError(getErrorMessage(error, 'Sign-in failed.'))
    } finally {
      setAuthBusy(false)
    }
  }

  async function performSignOut() {
    if (authBusy) return
    setAuthBusy(true)
    setAuthError('')
    try {
      await logout()
      setStatusMessage('Signed out securely.')
    } catch (error) {
      setAuthError(getErrorMessage(error, 'Sign-out failed.'))
    } finally {
      setAuthBusy(false)
    }
  }

  function requestSignOut() {
    if (dirty) setPendingDiscard({ kind: 'signout' })
    else void performSignOut()
  }

  function requestEdit(note: Note) {
    if (editingNote?.id === note.id) return
    if (dirty) setPendingDiscard({ kind: 'edit', note })
    else {
      setEditingNote(note)
      setDirty(false)
    }
  }

  function requestCancelEditing() {
    if (dirty) setPendingDiscard({ kind: 'cancel' })
    else setEditingNote(null)
  }

  function confirmDiscard() {
    const action = pendingDiscard
    setPendingDiscard(null)
    setDirty(false)
    if (!action || action.kind === 'cancel') {
      setEditingNote(null)
    } else if (action.kind === 'edit') {
      setEditingNote(action.note)
    } else {
      void performSignOut()
    }
  }

  async function submitNote(input: NoteInput) {
    setSaving(true)
    setStatusMessage('')
    try {
      if (editingNote) {
        await workspace.update(editingNote.id, input)
        setEditingNote(null)
        setDirty(false)
        setStatusMessage('Changes saved.')
      } else {
        await workspace.add(input)
        setDirty(false)
        setStatusMessage('Note created.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!confirmId) return
    const id = confirmId
    setDeleting(true)
    setStatusMessage('')
    try {
      await workspace.remove(id)
      if (editingNote?.id === id) {
        setEditingNote(null)
        setDirty(false)
      }
      setConfirmId(null)
      setStatusMessage('Note deleted.')
    } catch {
      // Workspace keeps the loaded notes and renders the API error.
    } finally {
      setDeleting(false)
    }
  }

  const error = authError || workspace.error
  const hasFilters = Boolean(filters.q || filters.tag)

  return (
    <div className="nv-app">
      <a href="#main-content" className="nv-skip-link">Skip to main content</a>
      <AppHeader
        user={user}
        authReady={authReady && !authInitializing}
        authBusy={authBusy}
        onSignIn={handleSignIn}
        onSignOut={requestSignOut}
      />

      {error && (
        <ErrorBanner
          message={error}
          onDismiss={() => { setAuthError(''); workspace.clearError() }}
        />
      )}
      {statusMessage && <div className="nv-status" role="status">{statusMessage}</div>}

      {authInitializing ? (
        <main id="main-content" className="nv-auth-loading" aria-busy="true">
          <span className="nv-spinner" aria-hidden="true" />
          <span>Restoring your private workspace…</span>
        </main>
      ) : user ? (
        <main id="main-content" className="nv-workspace" tabIndex={-1} aria-label="Notes workspace">
          <NoteComposer
            editingNote={editingNote}
            onSubmit={submitNote}
            onCancelEditing={requestCancelEditing}
            onDirtyChange={handleDirtyChange}
            loading={saving}
          />

          <section className="nv-panel nv-col-right" aria-label="Your notes">
            <div className="nv-notes-header">
              <h1 className="nv-panel-label">Your notes</h1>
              {!workspace.loading && (
                <span className="nv-notes-count" aria-live="polite">
                  {workspace.notes.length} loaded {workspace.notes.length === 1 ? 'note' : 'notes'}
                </span>
              )}
            </div>

            <NotesToolbar filters={filters} onChange={setFilters} loading={workspace.loading} />
            {workspace.searchLimited && (
              <p className="nv-search-limit" role="status">
                Search covers the most recent 200 notes. Refine the query if needed.
              </p>
            )}

            {workspace.loading ? (
              <LoadingSkeleton />
            ) : workspace.notes.length === 0 ? (
              <EmptyState hasFilters={hasFilters} onClearFilters={() => setFilters(EMPTY_FILTERS)} />
            ) : (
              <>
                <ul className="nv-note-list" aria-label="Notes" aria-live="polite" aria-relevant="additions removals">
                  {workspace.notes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      onEdit={requestEdit}
                      onDelete={setConfirmId}
                      onTagSelect={(tag) => setFilters({ q: '', tag })}
                    />
                  ))}
                </ul>
                <div className="nv-pagination" aria-live="polite">
                  {workspace.hasMore ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void workspace.loadMore()}
                      disabled={workspace.loadingMore}
                      aria-busy={workspace.loadingMore}
                    >
                      {workspace.loadingMore ? 'Loading more…' : 'Load more'}
                    </button>
                  ) : (
                    <span className="nv-pagination-end">End of loaded notes</span>
                  )}
                </div>
              </>
            )}
          </section>
        </main>
      ) : (
        <AuthLanding authReady={authReady} authBusy={authBusy} onSignIn={handleSignIn} />
      )}

      <ConfirmDialog
        open={confirmId !== null}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => { if (!deleting) setConfirmId(null) }}
      />
      <ConfirmDialog
        open={pendingDiscard !== null}
        loading={false}
        title="Discard unsaved changes?"
        description="Your current draft has not been saved. This action cannot be undone."
        confirmLabel="Discard changes"
        onConfirm={confirmDiscard}
        onCancel={() => setPendingDiscard(null)}
      />
    </div>
  )
}
