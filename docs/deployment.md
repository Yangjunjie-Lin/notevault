# Deployment

NoteVault uses two Vercel Projects connected to the same GitHub repository.

| Layer | Project | Root Directory | Production URL |
| --- | --- | --- | --- |
| Frontend | `notevault` | `frontend` | https://notevault-lovat.vercel.app |
| Backend | `notevault-api` | `backend` | https://notevault-api.vercel.app |

## Frontend project

```text
Framework: Vite
Install: npm ci
Build: npm run build
Output: dist
Production branch: main
```

Required production environment:

```text
VITE_API_BASE_URL=https://notevault-api.vercel.app
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Never set `VITE_TEST_AUTH` in Preview or Production.

Before promoting, run `npm --prefix frontend run test:production-auth-gate`; it must confirm that an ordinary production build rejects test auth. The E2E-only optimized bundle is built separately with mode `e2e` and is never a Vercel artifact.

## Backend project

```text
Framework: FastAPI
Entrypoint: app.main:app
Production branch: main
```

Required production environment:

```text
ENVIRONMENT=production
ALLOWED_ORIGINS=https://notevault-lovat.vercel.app
FIREBASE_CREDENTIALS_JSON=<sensitive single-line service account JSON>
CURSOR_SIGNING_KEY=<random secret of at least 32 characters>
```

Production startup rejects wildcard CORS and a missing/short cursor signing key. Add the frontend hostname—not its scheme—to Firebase Authentication Authorized Domains.

Verify Project settings separately. GitHub's legacy `Vercel` commit status may represent only one Project and is not sufficient evidence that both boundaries are Ready. In each Vercel Project, inspect the deployment for the same commit SHA and confirm the production alias before smoke testing.

## Firestore preparation

Deploy the root `firestore.indexes.json` composite index (`uid ASC`, `createdAt DESC`). If the database predates millisecond timestamps, run the timestamp script without `--apply`, review the count, then run it with `--apply`. Do this before relying on chronological cursor pagination.

## Deployment commands

The projects should be linked only in ignored `.vercel/` directories:

```bash
vercel link --cwd frontend --project notevault
vercel link --cwd backend --project notevault-api
vercel --prod --cwd backend
vercel --prod --cwd frontend
```

Do not create replacement Projects to fix a Root Directory error. Correct the existing Project settings so GitHub deployments build from `frontend` and `backend` respectively.

## Smoke verification

Anonymous checks:

```text
GET frontend /
GET API /health
GET API /docs
GET API /openapi.json
OPTIONS API /notes from the exact frontend Origin
GET API /notes without a bearer token -> 401
```

Authenticated checks: sign in, create, refresh/list, search, tag filter, edit, Load more, delete, and sign out. Browser diagnostics must show no localhost requests, CORS errors, unauthorized-domain errors, mixed content, failed assets, unhandled rejections, token logging, or service-account content.

Run the credential-free checks with:

```bash
python scripts/production_smoke.py
```

Authenticated acceptance additionally deletes the first-page cursor boundary from a 25+ note list and confirms Load more appends the remainder without duplicates. Do not automate production Google credentials in GitHub Actions.

## Rollback and limitations

Vercel retains immutable deployments; reassign the stable alias to the last Ready deployment if a smoke check fails. The in-memory rate limiter is per warm serverless instance, not globally distributed. Search is bounded to 200 recent notes.
