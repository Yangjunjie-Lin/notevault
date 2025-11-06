// frontend/src/firebase.js
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// ⚙️ Firebase web config
const firebaseConfig = {
  apiKey: "AIzaSyBp2Yj1yzvbDBlI0Iu0yt75C5y6hCTu2xM",
  authDomain: "greatunihackdemo.firebaseapp.com",
  projectId: "greatunihackdemo",
  storageBucket: "greatunihackdemo.firebasestorage.app",
  messagingSenderId: "616164585973",
  appId: "1:616164585973:web:9aaadd55b5cf947d5930bc"
};

// 🔥 Initialize Firebase
export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

// 🧩 Auth helpers
const provider = new GoogleAuthProvider()
export const signInWithGoogle = () => signInWithPopup(auth, provider)
export const logout = () => signOut(auth)
