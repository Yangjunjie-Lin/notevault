# Firestore Security Rules

NoteVault writes notes through the FastAPI backend with Firebase Admin SDK. Firebase Admin SDK bypasses Firestore Security Rules, so the recommended client-side rule set is intentionally restrictive.

## Recommended backend-only rules

Use these rules when the browser should not read or write Firestore directly:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /notes/{noteId} {
      allow read, write: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

In this model:

- The React app authenticates users with Firebase Authentication.
- The React app sends Firebase ID tokens to the FastAPI backend.
- The backend verifies ID tokens and performs Firestore reads and writes with Firebase Admin SDK.
- Firestore is not directly exposed to browser clients.

## Optional direct-client rules

If you later add direct Firestore access from the browser, use user-scoped rules and validate document shape:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /notes/{noteId} {
      allow read: if request.auth != null
        && resource.data.uid == request.auth.uid;

      allow create: if request.auth != null
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.keys().hasOnly(['uid', 'text', 'tags', 'createdAt'])
        && request.resource.data.text is string
        && request.resource.data.text.size() > 0
        && request.resource.data.text.size() <= 5000
        && request.resource.data.tags is list
        && request.resource.data.tags.size() <= 10;

      allow update, delete: if request.auth != null
        && resource.data.uid == request.auth.uid
        && request.resource.data.uid == request.auth.uid;
    }
  }
}
```

Prefer the backend-only rules unless the frontend has a clear reason to access Firestore directly.

