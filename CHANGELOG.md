# Changelog

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

