// frontend/src/App.jsx
import React, { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db, signInWithGoogle, logout } from './firebase'
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp
} from 'firebase/firestore'
import './styles/app.css'
import Header from './components/Header'
import NoteList from './components/NoteList'
import NoteForm from './components/NoteForm'

export default function App() {
  const [user, setUser] = useState(null)
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 🔹 监听登录状态变化
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setNotes([])
      setError('')
      if (!u) setLoading(false)
    })
    return unsubscribe
  }, [])

  // 🔹 Firestore 实时监听（仅在登录后）
  useEffect(() => {
    if (!user) return
    setLoading(true)

    const q = query(
      collection(db, 'notes'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        setNotes(fetched)
        setLoading(false)
      },
      (err) => {
        console.error(err)
        setError(err.message)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [user])

  async function addNote(text) {
    try {
      await addDoc(collection(db, 'notes'), {
        uid: user.uid,
        text,
        createdAt: serverTimestamp(),
        localTime: Date.now(),
      })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="container">
      <Header user={user} onSignIn={signInWithGoogle} onSignOut={logout} />

      {!user ? (
        <div className="login-hint">
          <p>Sign in with Google to start writing your personal notes securely in Firestore.</p>
          <button className="btn-primary" onClick={signInWithGoogle}>
            Sign in with Google
          </button>
        </div>
      ) : (
        <>
          <NoteForm onAdd={addNote} />
          {loading ? (
            <p style={{ textAlign: 'center', color: '#666' }}>Loading your notes...</p>
          ) : (
            <NoteList notes={notes} />
          )}
        </>
      )}

      {error && <p className="error-banner">⚠️ {error}</p>}
    </div>
  )
}
