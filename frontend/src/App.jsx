import React, { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, signInWithGoogle, logout } from './firebase'
import { api } from './api'
import './styles/app.css'
import Header from './components/Header'
import NoteList from './components/NoteList'
import NoteForm from './components/NoteForm'

export default function App() {
  const [user, setUser] = useState(null)
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      setNotes([])
      if (u) loadNotes()
    })
    return () => unsub()
  }, [])

  async function loadNotes() {
    try {
      setLoading(true)
      const data = await api.getNotes()
      setNotes(data.notes || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <Header user={user} onSignIn={signInWithGoogle} onSignOut={logout} />

      {user ? (
        <>
          <NoteForm onAdd={async text => {
            await api.addNote(text)
            loadNotes()
          }} loading={loading} />
          <NoteList notes={notes} />
        </>
      ) : (
        <div className="login-hint">
          <p>Sign in with Google to start writing your personal notes securely in Firestore.</p>
          <button className="btn-primary" onClick={signInWithGoogle}>Sign in with Google</button>
        </div>
      )}

      {error && <p className="error-banner">⚠️ {error}</p>}
    </div>
  )
}
