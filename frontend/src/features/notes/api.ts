import { auth } from '../auth/firebase'
import type { NoteFilters, NoteInput } from './types'

function resolveApiBaseUrl() {
  const configured = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')

  if (configured) return configured
  if (!import.meta.env.PROD) return 'http://localhost:8000'

  throw new Error(
    'Missing VITE_API_BASE_URL. Set it to the production FastAPI URL before building.',
  )
}

const API_BASE_URL = resolveApiBaseUrl()

function buildUrl(path: string, params: Partial<NoteFilters> = {}) {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.set(key, value)
  })

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const query = searchParams.toString()
  return `${API_BASE_URL}${normalizedPath}${query ? `?${query}` : ''}`
}

async function responseError(response: Response) {
  const fallback = `Request failed with status ${response.status}`
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null) as { detail?: unknown } | null
    if (typeof payload?.detail === 'string') return payload.detail
  }

  return (await response.text().catch(() => '')) || fallback
}

async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!auth?.currentUser) throw new Error('You must sign in before using notes.')

  const token = await auth.currentUser.getIdToken()
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (options.body) headers.set('Content-Type', 'application/json')

  const response = await fetch(path, { ...options, headers })
  if (!response.ok) throw new Error(await responseError(response))
  if (response.status === 204) return null as T
  return response.json() as Promise<T>
}

export const notesApi = {
  list: (filters: NoteFilters, signal?: AbortSignal) =>
    authFetch<{ notes: import('./types').Note[] }>(buildUrl('/notes', filters), { signal }),
  create: (input: NoteInput) =>
    authFetch<{ note: import('./types').Note }>(buildUrl('/notes'), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  delete: (id: string) =>
    authFetch<{ ok: boolean }>(buildUrl(`/notes/${encodeURIComponent(id)}`), {
      method: 'DELETE',
    }),
}
