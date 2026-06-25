# Deployment

NoteVault is easiest to deploy as two services: a static frontend and a FastAPI backend.

## Frontend

Use Vercel, Netlify, Cloudflare Pages, or another static host.

Recommended settings:

```text
Root directory: frontend
Build command: npm run build
Output directory: dist
```

Required environment variables:

```bash
VITE_API_BASE_URL=https://your-backend.example.com
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Backend

Use Railway, Render, Fly.io, or another Python host.

Recommended start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

If the platform deploys from the repository root, set the working directory to `backend`, or use:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT --app-dir backend
```

Required environment variables:

```bash
ALLOWED_ORIGINS=https://your-frontend.example.com
FIREBASE_CREDENTIALS_JSON={"type":"service_account","project_id":"your-project-id"}
```

## Railway

The `backend/railway.json` file is configured for a backend service whose root directory is `backend`.

## Deployment links

Fill these links after release and mirror them in the README:

| Target | URL |
| --- | --- |
| Frontend live app | `https://your-frontend.example.com` |
| Backend health check | `https://your-backend.example.com/health` |
| Backend API docs | `https://your-backend.example.com/docs` |
| CI workflow | `.github/workflows/ci.yml` |

## Production checks

- Confirm CI passes before deployment.
- Confirm `GET /health` returns `{"ok":true,...}`.
- Confirm the frontend `VITE_API_BASE_URL` points to the backend URL.
- Confirm Firebase Authentication has the production domain in its authorized domains.
- Confirm `ALLOWED_ORIGINS` contains the production frontend origin.
- Confirm Firestore rules follow [firestore-security-rules.md](firestore-security-rules.md).
