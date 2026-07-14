# Firebase setup

1. Enable Google in Firebase Authentication.
2. Add `localhost` for local work and `notevault-lovat.vercel.app` for production to Authorized Domains.
3. Create/select a Firebase Web App and store its `VITE_FIREBASE_*` values in untracked local files and Vercel frontend environment variables.
4. Enable Cloud Firestore.
5. Create an Admin service account and store its JSON only in `backend/serviceAccountKey.json` locally or the sensitive Vercel `FIREBASE_CREDENTIALS_JSON` variable.

Notes use this backend-owned shape:

```json
{
  "uid": "verified-firebase-uid",
  "text": "Markdown",
  "tags": ["work"],
  "createdAt": 1780000000000,
  "updatedAt": 1780001000000
}
```

`updatedAt` may be absent on legacy documents. Deploy the root `firestore.indexes.json`. Use `backend/scripts/normalize_note_timestamps.py` to audit and normalize old Firestore Timestamp values before enabling production pagination.

Firebase Web configuration is public browser configuration; Admin service-account JSON is a secret. The browser must never receive Admin credentials and never reads/writes Firestore directly.
