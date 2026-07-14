import { initializeApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth'

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

export const firebaseConfigError = missingKeys.length
  ? `Missing Firebase config values: ${missingKeys.join(', ')}`
  : ''

export const firebaseApp = firebaseConfigError ? null : initializeApp(firebaseConfig)
export const auth = firebaseApp ? getAuth(firebaseApp) : null

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

export function signInWithGoogle() {
  if (!auth) return Promise.reject(new Error(firebaseConfigError))
  return signInWithPopup(auth, googleProvider)
}

export function logout() {
  if (!auth) return Promise.resolve()
  return signOut(auth)
}
