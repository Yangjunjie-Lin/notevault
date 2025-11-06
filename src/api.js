import { auth } from './firebase'

// Vercel 部署时，API 和前端在同一域名下
const BACKEND = import.meta.env.VITE_API_BASE || '/api'

async function authFetch(path, options = {}) {
  const user = auth.currentUser
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (user) {
    const token = await user.getIdToken()
    headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(`${BACKEND}${path}`, { ...options, headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const api = {
  getNotes: () => authFetch('/notes'),
  addNote: (text) => authFetch('/notes', {
    method: 'POST',
    body: JSON.stringify({ text })
  })
}
