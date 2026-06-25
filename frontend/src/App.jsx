import React, { useCallback, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'

import { api } from './api'
import Header from './components/Header'
import NoteForm from './components/NoteForm'
import NoteList from './components/NoteList'
import { auth, firebaseConfigError, logout, signInWithGoogle } from './firebase'
import './styles/app.css'

export default function App() {
  const [user, setUser] = useState(null)
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadNotes = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const data = await api.getNotes()
      setNotes(data.notes)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!auth) {
      setError(firebaseConfigError)
      setLoading(false)
      return undefined
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setNotes([])
      setError('')

      if (currentUser) {
        loadNotes()
      } else {
        setLoading(false)
      }
    })

    return unsubscribe
  }, [loadNotes])

  async function handleSignIn() {
    setError('')

    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err.message)
    }
  }

  async function addNote(text) {
    setSaving(true)
    setError('')

    try {
      const data = await api.addNote(text)
      setNotes((current) => [data.note, ...current])
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function deleteNote(id) {
    setError('')

    try {
      await api.deleteNote(id)
      setNotes((current) => current.filter((note) => note.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <main className="app-shell">
      <Header
        user={user}
        authReady={Boolean(auth)}
        onSignIn={handleSignIn}
        onSignOut={logout}
      />

      {user ? (
        <section className="notes-panel">
          <NoteForm onAdd={addNote} loading={saving} />
          {loading ? (
            <p className="muted-message">Loading notes...</p>
          ) : (
            <NoteList notes={notes} onDelete={deleteNote} />
          )}
        </section>
      ) : (
        <section className="login-panel">
          <h2>Your notes, available after sign in.</h2>
          <p>Use Google sign-in to access your private notebook.</p>
          <button className="btn-primary" onClick={handleSignIn} disabled={!auth}>
            Sign in with Google
          </button>
        </section>
      )}

      {error && <p className="error-banner" role="alert">{error}</p>}
    </main>
  )
}
