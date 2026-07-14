import { beforeEach, describe, expect, it, vi } from 'vitest'

const authState = {
  currentUser: { getIdToken: vi.fn().mockResolvedValue('firebase-token') },
}
const onAuthStateChanged = vi.fn()
const signInWithPopup = vi.fn().mockResolvedValue(undefined)
const signOut = vi.fn().mockResolvedValue(undefined)

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({ name: 'test-app' })) }))
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => authState),
  GoogleAuthProvider: class {
    setCustomParameters = vi.fn()
  },
  onAuthStateChanged,
  signInWithPopup,
  signOut,
}))

const CONFIG_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

describe('Firebase auth adapter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    CONFIG_KEYS.forEach((key) => vi.stubEnv(key, ''))
    vi.stubEnv('VITE_TEST_AUTH', '')
    vi.stubEnv('MODE', 'test')
    vi.stubEnv('PROD', false)
  })

  it('reports missing production Firebase configuration without initializing auth', async () => {
    const adapter = await import('./firebase')
    expect(adapter.authReady).toBe(false)
    expect(adapter.firebaseConfigError).toContain('apiKey')
    const onError = vi.fn()
    adapter.subscribeToAuth(vi.fn(), onError)
    await Promise.resolve()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('apiKey') }))
    await expect(adapter.signInWithGoogle()).rejects.toThrow('Missing Firebase config')
    await expect(adapter.logout()).resolves.toBeUndefined()
    await expect(adapter.getIdToken()).rejects.toThrow('You must sign in')
  })

  it('delegates configured authentication and token operations to Firebase', async () => {
    CONFIG_KEYS.forEach((key) => vi.stubEnv(key, 'configured'))
    onAuthStateChanged.mockReturnValue(vi.fn())
    const adapter = await import('./firebase')
    const next = vi.fn()
    const onError = vi.fn()

    adapter.subscribeToAuth(next, onError)
    await adapter.signInWithGoogle()
    await adapter.logout()
    await expect(adapter.getIdToken()).resolves.toBe('firebase-token')

    expect(onAuthStateChanged).toHaveBeenCalled()
    expect(signInWithPopup).toHaveBeenCalled()
    expect(signOut).toHaveBeenCalledWith(authState)
  })

  it('supports test auth only in explicit e2e mode', async () => {
    vi.stubEnv('MODE', 'e2e')
    vi.stubEnv('VITE_TEST_AUTH', 'true')
    const adapter = await import('./firebase')
    const listener = vi.fn()
    const unsubscribe = adapter.subscribeToAuth(listener, vi.fn())
    await Promise.resolve()
    expect(listener).toHaveBeenLastCalledWith(null)

    await adapter.signInWithGoogle()
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ uid: 'e2e-user' }))
    await expect(adapter.getIdToken()).resolves.toBe('not-a-jwt')
    await adapter.logout()
    expect(listener).toHaveBeenLastCalledWith(null)
    unsubscribe()
  })
})
