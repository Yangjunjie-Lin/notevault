import { auth } from './firebase'

function resolveApiBaseUrl() {
  const configured = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')

  if (configured) {
    return configured
  }

  if (import.meta.env.PROD) {
    throw new Error(
      'Missing VITE_API_BASE_URL. Set it to the production FastAPI URL before building.',
    )
  }

  return 'http://localhost:8000'
}

const API_BASE_URL = resolveApiBaseUrl()

function buildUrl(path, params = {}) {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.set(key, value)
  })

  const query = searchParams.toString()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}${query ? `?${query}` : ''}`
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
