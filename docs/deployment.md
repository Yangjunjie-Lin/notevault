# Deployment

NoteVault uses two Vercel Projects connected to the same GitHub repository. Treat them as separate trust boundaries even though they deploy the same commit.

| Layer | Project | Root Directory | Production URL |
| --- | --- | --- | --- |
| Frontend | `notevault` | `frontend` | https://notevault-lovat.vercel.app |
| Backend | `notevault-api` | `backend` | https://notevault-api.vercel.app |

## Frontend Project

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

Firebase Web configuration is intentionally browser-visible. SiliconFlow configuration is not. Do not add `SILICONFLOW_API_KEY`, `VITE_SILICONFLOW_API_KEY`, another provider credential, or a direct provider URL to this Project.

Never set `VITE_TEST_AUTH` in Preview or Production. Before promoting, run `npm --prefix frontend run test:production-auth-gate`; an ordinary production build must reject test auth.

## Backend Project

```text
Framework: FastAPI
Entrypoint: app.main:app
Production branch: main
```

Required production environment:

```dotenv
ENVIRONMENT=production
APP_VERSION=1.2.0
ALLOWED_ORIGINS=https://notevault-lovat.vercel.app
FIREBASE_CREDENTIALS_JSON=<sensitive single-line service account JSON>
CURSOR_SIGNING_KEY=<random secret of at least 32 characters>
SILICONFLOW_API_KEY=YOUR_SILICONFLOW_API_KEY_HERE
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=deepseek-ai/DeepSeek-V4-Flash
SILICONFLOW_TIMEOUT_SECONDS=45
SILICONFLOW_MAX_TOKENS=4096
SILICONFLOW_AI_RATE_LIMIT_PER_MINUTE=10
```

Configure these `SILICONFLOW_*` values only in the backend `notevault-api` Project. Replace the placeholder in Vercel's encrypted environment UI; never replace it inside `.env.example`, documentation, source, OpenAPI examples, CI configuration, or the frontend Project.

Production startup rejects wildcard CORS and a missing/short cursor signing key. A missing SiliconFlow key is intentionally different: the application and ordinary note routes still start, while authenticated AI endpoints return the sanitized `503 AI service is not configured` response.

Add `notevault-lovat.vercel.app`—the hostname, not the scheme—to Firebase Authentication Authorized Domains.

## Local and Preview configuration

For local development, copy `.env.example` to the ignored root `.env` and replace the provider placeholder there only if real AI calls are intentionally required. Unit, component, E2E, contract, and ordinary CI runs use provider mocks and do not need a real key.

Use a dedicated low-privilege provider key for a shared Preview environment. Do not reuse a personal development key in production. Avoid exposing sensitive user notes in Preview smoke tests.

If any key has been pasted into chat, committed, logged, or placed in frontend configuration, revoke it before deployment and create a replacement. See [../SECURITY.md](../SECURITY.md) for the complete rotation procedure.

## Firestore preparation

Deploy `firestore.indexes.json` and wait for the composite index (`uid ASC`, `createdAt DESC`) to become Enabled. If the database predates millisecond timestamps, run the normalization script without `--apply`, review the count, then run it with `--apply` before relying on chronological cursor pagination.

AI Assist sessions and candidates are not stored in Firestore in v1.2.0, so this release requires no AI-data migration.

## Pre-deployment gates

Install exactly from lockfiles and pinned Python requirements, then run the maintained gates:

```bash
npm ci
npm --prefix frontend ci
python -m pip install -r backend/requirements-dev.txt
npm run release:check
npm run check
npm run test:e2e
npm run test:firebase-integration
python -m compileall backend/app
npm audit
npm audit --omit=dev
npm --prefix frontend audit
npm --prefix frontend audit --omit=dev
```

FastAPI remains the schema source. Run `npm run contract:generate`, commit the generated OpenAPI JSON and TypeScript types, and confirm `npm run contract:check` before deployment. Automated tests must not reach SiliconFlow.

## Deployment order

The Projects should be linked only inside ignored `.vercel/` directories:

```bash
vercel link --cwd backend --project notevault-api
vercel link --cwd frontend --project notevault
vercel --prod --cwd backend
vercel --prod --cwd frontend
```

Deploy the backend first so the AI contract exists before the new frontend is promoted. Confirm both deployments reference the expected commit SHA, are Ready, and own their stable aliases. GitHub's legacy `Vercel` status may represent only one Project and is not sufficient evidence.

Do not create replacement Projects to fix a Root Directory error. Correct the existing Project settings.

## Verify the provider key is absent from the frontend

Build an ordinary production bundle without any SiliconFlow variable in the frontend environment:

```bash
npm --prefix frontend run build
```

Then fail the review if the bundle contains a provider-secret name, direct Chat Completions endpoint, or a token-shaped value:

```bash
if rg -n "SILICONFLOW_API_KEY|VITE_SILICONFLOW|api\.siliconflow\.cn/v1/chat/completions|sk-[A-Za-z0-9_-]{24,}" frontend/dist; then
  echo "Unexpected provider material in frontend bundle" >&2
  exit 1
fi
```

The scan is a release guard, not proof that an exposed key remains safe. If an actual value is found, revoke it immediately. Also inspect Vercel frontend environment settings and source maps. The maintained `scripts/production_smoke.py` checks deployed assets for provider-boundary markers without requiring a credential.

## Smoke verification

Run credential-free checks:

```bash
python scripts/production_smoke.py
```

The script verifies frontend HTML/assets, backend health/docs/OpenAPI, unauthenticated note and AI behavior, exact CORS, and bundle exclusions. It does not call SiliconFlow.

Complete authenticated acceptance manually with a disposable note:

1. Sign in and create a deliberately untidy Markdown draft.
2. Click **Add note**, confirm the formatting review appears when the result changes, inspect both versions, choose **Apply & Save**, and verify tags are unchanged.
3. Exercise an unchanged formatting result and verify it saves without a redundant review.
4. Edit the note, open **AI Assist**, submit a non-sensitive editing instruction, inspect preview and source, continue with a second instruction, and choose **Apply to draft**.
5. Confirm applying does not write to Firestore until **Save changes** is selected, then complete the final formatting review.
6. Confirm closing/canceling preserves the original draft and sign-out clears temporary AI state.
7. In an isolated Preview deployment, remove or invalidate only the Preview provider key, verify the sanitized AI failure and explicit **Save Original** path, then restore a newly validated key. Do not intentionally break the production Project for this test.
8. Remove the disposable note and review backend/provider diagnostics for trace metadata only—never note text, instruction text, credentials, or full responses.

Browser diagnostics must show no direct request to `api.siliconflow.cn`, localhost request, CORS error, mixed content, failed asset, unhandled rejection, token log, note-content log, or service-account content.

## Monitoring and operational limits

Monitor sanitized provider error categories, latency, response status, optional trace IDs, quota usage, and billing alerts. Do not enable request/response body logging or verbose HTTP header logging.

The AI limiter is in-memory per warm Vercel instance. It is useful for local fairness but is not a distributed/global quota or billing control. SiliconFlow quotas and account safeguards remain necessary.

Provider calls are non-streaming. AI session history exists only in the current frontend session. A provider outage disables revision and causes formatter failure recovery, but ordinary note reads/writes remain available and the original draft can be saved through the explicit fallback.

## Rollback

Vercel retains immutable deployments. If smoke checks fail, reassign both stable aliases to the last mutually compatible Ready deployments. Rolling back only one boundary can leave the frontend and OpenAPI contract mismatched.

AI fields are not stored in notes, so v1.2.0 rollback requires no AI-data migration. If the incident is provider-only, leave ordinary note service online, rotate or remove the backend key as needed, and communicate that AI features are temporarily unavailable. Never copy the key into the frontend as a workaround.
