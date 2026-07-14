# Changelog

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
