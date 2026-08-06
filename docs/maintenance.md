# NoteVault maintenance policy

## Project status

```text
Active feature development
AI-assisted Markdown editing
Production-oriented
Portfolio flagship
```

NoteVault v1.2.0 supports two bounded AI features: reviewable Markdown normalization before save and temporary AI Assist revision candidates inside the existing Composer. This is a deliberate supported feature phase, so the previous statement that all AI features were out of scope no longer applies.

Production status remains a two-boundary claim: both the `notevault` frontend and `notevault-api` backend deployments must be Ready for the same commit and the release smoke checklist must pass. A single Vercel status is insufficient.

## Supported change scope

- Security vulnerabilities, credential rotation, prompt-boundary hardening, and privacy corrections
- Reliability and usability improvements to automatic Markdown formatting and AI Assist
- Browser, Firebase, FastAPI, Vite, Node, Python, SiliconFlow API, and DeepSeek model compatibility
- Dependency support, end-of-life maintenance, and reproducible user-reported bugs
- Tested accessibility, performance, availability, and failure-recovery improvements
- Typed API-contract changes with regenerated OpenAPI and frontend types

## Out of scope

- General-purpose chat, autonomous agents, tool calling, RAG, embeddings, vector databases, or web search
- AI features that directly save to Firestore, bypass review/apply controls, change tags, or expose provider credentials to the browser
- Persisted AI conversations or cross-note memory
- Collaboration, sharing, notifications, attachments, rich text, or offline synchronization
- Subscriptions, payments, advertising, or analytics tracking
- Microservices, Redis, external search services, or new global frontend state frameworks without a separately approved architecture change

## Release checklist

- [ ] `npm ci` and `npm --prefix frontend ci`
- [ ] `npm run typecheck:frontend`
- [ ] `npm run test:frontend` and `npm run test:coverage`
- [ ] `python -m compileall backend/app`
- [ ] `npm run test:backend:coverage`
- [ ] `npm run contract:generate` and `npm run contract:check`
- [ ] `npm run build:frontend`
- [ ] `npm run release:check` and `npm run check`
- [ ] Production-build E2E: Chromium full, Firefox/WebKit smoke, mobile viewport smoke, axe, AI review/apply, and provider-failure fallback
- [ ] `npm run test:firebase-integration`
- [ ] `npm audit`, `npm audit --omit=dev`, `npm --prefix frontend audit`, and `npm --prefix frontend audit --omit=dev`
- [ ] Review Python dependency versions/advisories; confirm runtime pins agree between `backend/requirements.txt` and `backend/pyproject.toml`
- [ ] `python scripts/production_smoke.py`
- [ ] Frontend `notevault` and backend `notevault-api` deployments are Ready for the same commit
- [ ] All `SILICONFLOW_*` values exist only in the backend Project; the key is absent from frontend environment variables and bundle assets
- [ ] Firestore composite index reports Enabled and Firebase Authorized Domains contains the production frontend hostname
- [ ] Authenticated create/edit flows cover identical formatting, formatting review, save-original recovery, AI Assist apply, and sign-out state cleanup
- [ ] No `.env`, `.vercel/`, service account, private key, token, provider key, provider response, or test artifact is tracked
- [ ] Changelog, package/lockfile versions, backend/OpenAPI version, README badge, tag, release notes, and any GitHub Release agree

Automated tests must mock the provider. A real SiliconFlow key is neither necessary nor permitted in ordinary CI.

## AI integration maintenance

- Preserve the `Router -> AI service -> SiliconFlow client` boundary; provider HTTP and prompts do not belong in note persistence routes.
- Keep prompts centralized and continue treating note text as untrusted data. The explicit AI Assist instruction is separate from instructions embedded in the note.
- Preserve strict request lengths, `extra="forbid"`, server-selected provider parameters, output validation, safe Markdown rendering, and sanitized error mapping.
- Do not log note content, editing instructions, authorization headers, provider keys, or full provider responses. Operational logs may contain sanitized category, status, duration, request kind, and optional trace ID.
- Test transient retries and ensure the total attempt count remains bounded. Do not retry provider `400`, `401`, `403`, `404`, or validation failures.
- Reconfirm SiliconFlow's current Chat Completions contract and configured model availability before changing request fields. Do not add unverified reasoning, streaming, tool, or structured-output parameters.
- Keep ordinary note CRUD available when the API key is missing or the provider is unavailable.

## Dependency and supply-chain policy

The AI integration uses `httpx==0.28.1` because the backend requires maintained async HTTPS, explicit timeouts, response validation, and cancellation support. It is a runtime dependency in both `backend/requirements.txt` and `backend/pyproject.toml`; `backend/requirements-dev.txt` inherits it. No SiliconFlow/OpenAI browser SDK or agent framework is needed.

Every new dependency must have a documented feature need, a reviewed version constraint, an updated lock or requirements source, tests, and an audit/advisory review. Prefer existing libraries and standard-library code. Dependabot monitors root npm, frontend npm, backend pip, and GitHub Actions monthly. Dependency updates must preserve the AI mock boundary so audits and CI never require a production provider credential.

## Database and cursor changes

1. Preserve read compatibility before changing a stored field.
2. Run migration scripts in dry-run mode and record affected counts.
3. Deploy `firestore.indexes.json` and wait until every index is Enabled.
4. Apply the migration, run Emulator integration, then production smoke.
5. Roll back application aliases first if production validation fails. Restore data only from an operator-reviewed backup or reversible migration plan.

AI drafts, candidates, and conversation messages are not stored in Firestore in v1.2.0. Introducing persistence is a schema/privacy change and requires separate review.

Version 2 timeline cursors sign `createdAt` and document ID and continue by field values. Filtered search scans a bounded recent-note set and uses a signed offset. Cursor key rotation invalidates existing cursors and must be called out in release notes.

## Security maintenance

- Keep service-account JSON, cursor keys, and SiliconFlow keys only in ignored local files or backend deployment secrets.
- Rotate any provider key disclosed in chat, logs, issues, Git, frontend configuration, build artifacts, or source maps before reuse.
- Keep exact production CORS; wildcard origins remain forbidden.
- Keep test auth exclusive to Vite `e2e` mode and provider mocks exclusive to tests.
- Periodically inspect frontend artifacts for `SILICONFLOW_API_KEY`, `VITE_SILICONFLOW`, direct provider endpoints, authorization-header material, and token-shaped `sk-...` values.

## Rate limiting and availability

Read, write, and AI budgets are separate and keyed by verified UID. Formatting and revision share the configured AI budget. The limiter is resettable in tests and returns `Retry-After` on `429`.

The limiter is in-memory per warm serverless instance, not distributed or global. Provider quotas and billing alerts are separate controls. During provider failure, the supported degradation is a preserved draft, sanitized feedback, retry/cancel controls, and explicit save-original behavior; AI Assist does not fabricate a local fallback.

## Browser maintenance

Chromium runs the full suite. Firefox and WebKit run the maintained core smoke, including mobile viewport checks. The current Windows administrator-session Firefox runtime may fail before page creation with Playwright's known `browserContext.newPage` issue; Ubuntu CI remains the Firefox release authority. This exception must never become a skipped CI project.

## Production acceptance

Anonymous automation checks frontend HTML/assets, backend health/docs/OpenAPI, unauthenticated `401` behavior, exact CORS, and absence of local/test/provider-secret bundle markers. Authenticated acceptance remains an operator checklist because CI has no production user token.

For authenticated AI acceptance, create a temporary draft, exercise changed and unchanged formatter results, verify every review choice, apply an AI Assist candidate without saving it automatically, then save and review final formatting. Simulate or induce a controlled provider failure and verify that the original draft remains savable only after explicit confirmation. Remove all temporary notes afterward.
