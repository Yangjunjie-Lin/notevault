import { initializeApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'

export type AuthUser = Pick<User, 'uid' | 'displayName' | 'email' | 'photoURL'>

const testAuthEnabled =
  import.meta.env.MODE === 'e2e' && import.meta.env.VITE_TEST_AUTH === 'true'

if (import.meta.env.MODE !== 'e2e' && import.meta.env.VITE_TEST_AUTH === 'true') {
  throw new Error('Test authentication cannot be enabled in a production build.')
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key)

export const firebaseConfigError = testAuthEnabled || missingKeys.length === 0
  ? ''
  : `Missing Firebase config values: ${missingKeys.join(', ')}`

export const firebaseApp = testAuthEnabled || firebaseConfigError
  ? null
  : initializeApp(firebaseConfig)
export const auth = firebaseApp ? getAuth(firebaseApp) : null
export const authReady = testAuthEnabled || Boolean(auth)

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

const testUser: AuthUser = {
  uid: 'e2e-user',
  displayName: 'E2E User',
  email: 'e2e@example.com',
  photoURL: null,
}
let currentTestUser: AuthUser | null = null
const testListeners = new Set<(user: AuthUser | null) => void>()

export function subscribeToAuth(
  next: (user: AuthUser | null) => void,
  onError: (error: Error) => void,
) {
  if (testAuthEnabled) {
    testListeners.add(next)
    queueMicrotask(() => next(currentTestUser))
    return () => testListeners.delete(next)
  }
  if (!auth) {
    queueMicrotask(() => onError(new Error(firebaseConfigError)))
    return () => undefined
  }
  return onAuthStateChanged(auth, next, onError)
}

export async function signInWithGoogle() {
  if (testAuthEnabled) {
    currentTestUser = testUser
    testListeners.forEach((listener) => listener(currentTestUser))
    return
  }
  if (!auth) throw new Error(firebaseConfigError)
  await signInWithPopup(auth, googleProvider)
}

export async function logout() {
  if (testAuthEnabled) {
    currentTestUser = null
    testListeners.forEach((listener) => listener(currentTestUser))
    return
  }
  if (auth) await signOut(auth)
}

export async function getIdToken() {
  if (testAuthEnabled && currentTestUser) return 'not-a-jwt'
  if (!auth?.currentUser) throw new Error('You must sign in before using notes.')
  return auth.currentUser.getIdToken()
}
