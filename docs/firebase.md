# Firebase Setup

## 1. Create a Firebase project

Open the Firebase Console and create a project for NoteVault.

## 2. Enable Google sign-in

Go to Authentication -> Sign-in method, then enable Google.

Add local development domains if needed:

- `localhost`
- `127.0.0.1`

## 3. Create a Web App

In Project settings -> General, create or select a Web App and copy its config values into `.env`:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## 4. Enable Firestore

Create a Firestore database. The backend stores notes in a `notes` collection with this shape:

```json
{
  "uid": "firebase-user-id",
  "text": "note content",
  "tags": ["work", "ideas"],
  "createdAt": 1710000000000
}
```

Because all note writes go through the backend, Firestore client write rules can stay restrictive. See [firestore-security-rules.md](firestore-security-rules.md).

## 5. Configure the service account

Create a service account key in Project settings -> Service accounts.

For local development, save it as:

```text
backend/serviceAccountKey.json
```

For deployment, prefer `FIREBASE_CREDENTIALS_JSON` as a platform environment variable. Keep it as a single-line JSON string.
