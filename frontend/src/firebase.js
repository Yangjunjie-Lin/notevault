// Fill with your Firebase Web config from the Firebase Console.
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBp2Yj1yzvbDBlI0Iu0yt75C5y6hCTu2xM",
  authDomain: "greatunihackdemo.firebaseapp.com",
  projectId: "greatunihackdemo",
  storageBucket: "greatunihackdemo.firebasestorage.app",
  messagingSenderId: "616164585973",
  appId: "1:616164585973:web:9aaadd55b5cf947d5930bc"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app)
const provider = new GoogleAuthProvider()

export async function signInWithGoogle() {
  await signInWithPopup(auth, provider)
}

export async function logout() {
  await signOut(auth)
}
