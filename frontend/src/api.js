import { auth } from './firebase'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

async function authFetch(path, options = {}) {
  if (!auth?.currentUser) {
    throw new Error('You must sign in before using notes.')
  }

  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const token = await auth.currentUser.getIdToken()
  headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) return null
  return response.json()
}

export const api = {
  getNotes: () => authFetch('/notes'),
  addNote: (text) => authFetch('/notes', {
    method: 'POST',
    body: JSON.stringify({ text }),
  }),
  deleteNote: (id) => authFetch(`/notes/${id}`, {
    method: 'DELETE',
  }),
}

