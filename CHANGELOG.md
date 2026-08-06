# Changelog

## 1.2.0 — 2026-08-06 — AI Markdown Assistant

### Added

- Added authenticated `POST /ai/format-markdown` and `POST /ai/revise-note` endpoints backed by DeepSeek V4 Flash through SiliconFlow's non-streaming Chat Completions API.
- Added automatic Markdown normalization before note creation and update, including a review step with **Apply & Save**, **Save Original**, and **Cancel** choices.
- Added an in-composer AI Assist workflow with iterative revision candidates, preview/source inspection, retry, discard, close, and explicit apply-to-draft behavior.
- Added dedicated AI request limiting per verified Firebase UID, bounded input contracts, provider-output validation, sanitized error mapping, timeout handling, and limited transient retries.
- Added mocked backend, frontend, accessibility, stale-request, failure-recovery, and browser workflow coverage without using a live provider key in CI.
- Added AI integration, privacy, deployment, maintenance, security, and v1.2.0 release documentation.

### Changed

- Changed project status from feature-complete maintenance mode to active, production-oriented AI-assisted Markdown development.
- Extended the generated FastAPI/OpenAPI/TypeScript contract with AI request and response schemas while keeping FastAPI as the source of truth.
- Preserved tags outside the AI boundary and kept AI Assist candidates in temporary frontend session state until explicitly applied.
- Updated package, backend, OpenAPI, environment-template, README badge, changelog, lockfile, and release-note metadata to v1.2.0.

### Security and privacy

- Kept `SILICONFLOW_API_KEY` exclusively in backend configuration; the frontend never calls SiliconFlow or uses a `VITE_*` provider secret.
- Documented that AI use sends the current draft, and for AI Assist the editing instruction, from NoteVault's backend to SiliconFlow for processing.
- Treats note content as untrusted data in backend-owned prompts, rejects empty or oversized output, retains safe Markdown rendering, and never logs note bodies, editing instructions, authorization headers, or full provider responses.
- Preserves the original draft on AI failure and requires review or explicit apply actions before AI text can be saved.
- Rejects non-complete provider finish reasons, blocks remote Markdown image loading, sanitizes validation echoes, and declares Firebase bearer/error contracts in OpenAPI.

### Dependencies

- Added the pinned `httpx==0.27.2` backend runtime dependency for timeout-aware asynchronous HTTPS calls and bounded retries. No provider SDK, agent framework, browser SDK, global state framework, editor, or diff dependency was introduced.
- Kept npm lockfiles synchronized and expanded release/hygiene checks for version metadata, AI configuration placeholders, and frontend secret exclusions.

### Known limitations

- AI rate limiting is in-memory per warm Vercel instance, not globally distributed.
- When SiliconFlow is unavailable, AI Assist is unavailable and save formatting falls back only through an explicit user choice to save the original draft.
- AI Assist sessions are temporary browser state and are not persisted to Firestore.
- Provider responses are non-streaming; this release has no RAG, embeddings, vector database, or general knowledge chat.
- The latest Firebase CLI retains five moderate development-only transitive audit advisories; root production dependencies and all frontend dependencies audit cleanly after the non-breaking lock refresh. No forced CLI downgrade or untested major override is included.

## 1.1.0 — 2026-07-15 — stable maintenance release

### Fixed

- Replaced snapshot-dependent page cursors with signed `createdAt` + document-ID continuation values, so deleting or editing the boundary note no longer breaks Load more.
- Made dialog focus restoration explicit for Safari/WebKit and added a render-error fallback that does not expose stack traces.
- Unified NoteCard and editor preview through one raw-HTML-disabled Markdown rendering contract and verified unsafe links/scripts/handlers.
- Raised muted-text contrast and maintained approximately 40–44px interactive targets without redesigning the existing UI.

### Added

- Mutation-focused backend/frontend tests and a 25-note boundary-deletion Playwright workflow.
- Optimized `vite build --mode e2e` + `vite preview` coverage with Chromium full, Firefox/WebKit smoke, mobile viewport smoke, axe, failure diagnostics, and isolated test reset/seed routes.
- Real Firestore SDK tests under the Firestore Emulator, an anonymous production smoke workflow, Dependabot, maintenance policy, and structured issue templates.
- `Retry-After` on in-memory 429 responses and a low-frequency maintenance dependency policy.

### Changed

- Version 2 timeline cursor payloads bind the verified UID, mode, filter fingerprint, creation time, and document ID with HMAC-SHA256.
- Clarified that filtered search uses bounded recent-note scanning and signed offset pagination rather than claiming mutation-safe snapshot consistency.
- Existing in-memory cursors are invalidated after deployment; reloading the notes list resolves this automatically.
- Marked NoteVault stable, feature-complete, and in maintenance mode. No new product-scope features are planned.

### Known limitations

- Main-timeline cursor continuation is not a frozen Firestore snapshot; filtered search remains a bounded recent-200-note scan with offset pagination.
- Rate limiting is best-effort per warm serverless instance, not global.
- Firestore Emulator verifies SDK query behavior but does not fully reproduce production composite-index enforcement.

## 2026-07-14 — product completeness and stability

### Added

- Secure `PATCH /notes/{note_id}` with owner-hiding 404 behavior, normalized writes, preserved creation time, and nullable `updatedAt` compatibility.
- HMAC-signed cursor pagination, stable document-ID ordering, bounded 200-note search, and a Firestore composite index definition.
- Reusable Composer edit mode, dirty-draft confirmation, success feedback, updated timestamps, and Load more interaction.
- OpenAPI-generated frontend contract types with a CI drift check.
- Playwright E2E coverage using isolated test-only auth/store adapters, plus frontend and backend coverage gates.
- A dry-run-first legacy Firestore timestamp normalization script.

### Changed

- Moved note request/page/mutation state into a focused `useNotes` hook with abort, stale-response, deduplication, and filter-reset guarantees.
- Expanded CI into frontend, backend, contract, E2E, and repository-hygiene jobs.
- Updated deployment, Firebase, Firestore, architecture, contribution, and README contracts.

### Security

- Production now requires an explicit cursor signing key and continues to reject wildcard CORS.
- Request schemas forbid client-supplied extra fields such as `uid`.
- Firestore failures return a sanitized 503 without database internals.

## 2026-07-14

### Changed

- Integrated the redesigned NoteVault workspace into the production frontend.
- Migrated the frontend to strict TypeScript and feature-oriented module boundaries.
- Reworked authentication restoration and note loading to prevent UI flashes, duplicate requests, and stale-response races.
- Updated project documentation and CI to match the production architecture.

### Added

- Accessible confirmation, error, loading, empty, and filtered-empty states.
- Clickable tag filtering and direct filter reset actions.
- Integration coverage for write/preview, create, search, clear, tag filter, delete confirmation, and signed-out flows.
- A dedicated architecture guide.

### Fixed

- Removed the Firestore compound query that required an undeclared `uid + createdAt` index and prevented authenticated users from loading notes.
- Converted Firestore read failures into a readable `503` API response with CORS headers instead of a browser-level network error.
- Replaced raw Markdown syntax examples in the composer with a concise support label.
- Normalized legacy Firestore Timestamp values to the frontend millisecond contract so existing notes remain readable.

## 2026-06-25

### Changed

- Reorganized the repository into a clean `frontend/`, `backend/`, and `docs/` structure.
- Replaced the duplicated root-level React app with a single Vite app under `frontend/`.
- Replaced the mixed backend/serverless code with a standard FastAPI package under `backend/app/`.
- Updated the frontend to use Firebase Auth for sign-in and FastAPI for note operations.
- Moved Firebase configuration to environment variables instead of hard-coded values.
- Rewrote the README, Firebase guide, deployment guide, and environment variable example.
- Removed the committed `.venv/` directory and added virtual environment ignores.

### Added

- `GET /health`
- `GET /notes`
- `POST /notes`
- `DELETE /notes/{note_id}`
- Root npm scripts for common frontend and backend commands.

### Removed

- Old Vercel serverless `api/` implementation.
- Duplicated root `src/`, `index.html`, and `vite.config.js`.
- Outdated deployment and quick-reference documents that no longer matched the project.
