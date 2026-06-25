import { auth } from './firebase'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

function buildUrl(path, params = {}) {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.set(key, value)
  })

  const query = searchParams.toString()
  return `${API_BASE_URL}${path}${query ? `?${query}` : ''}`
}

async function authFetch(path, options = {}) {
  if (!auth?.currentUser) {
    throw new Error('You must sign in before using notes.')
  }

  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const token = await auth.currentUser.getIdToken()
  headers.Authorization = `Bearer ${token}`

  const response = await fetch(path, { ...options, headers })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) return null
  return response.json()
}

export const api = {
  getNotes: (filters = {}) => authFetch(buildUrl('/notes', filters)),
  addNote: ({ text, tags }) => authFetch(buildUrl('/notes'), {
    method: 'POST',
    body: JSON.stringify({ text, tags }),
  }),
  deleteNote: (id) => authFetch(buildUrl(`/notes/${id}`), {
    method: 'DELETE',
  }),
}
