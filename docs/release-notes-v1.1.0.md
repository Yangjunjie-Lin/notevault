# NoteVault v1.1.0 — Stable Maintenance Release

NoteVault 1.1.0 closes the final pagination and deployment-boundary gaps without expanding product scope.

## Highlights

- Mutation-safe version 2 cursor pagination continues after the boundary note is edited or deleted.
- Production-preview Playwright runs Chromium full workflows, Firefox/WebKit smoke, and axe checks.
- Real Firestore SDK integration covers ordering, document-name continuation, Timestamp values, ownership, update/delete, and boundary deletion under the Emulator.
- One safe Markdown contract blocks raw HTML and unsafe protocols in both note cards and editor preview.
- Production auth bypass is rejected at Vite configuration time, before an ordinary production bundle can be created.
- Anonymous production smoke, Dependabot, issue forms, error recovery, focus restoration, and maintenance policy are included.

## Upgrade note

Existing in-memory version 1 cursors are invalidated after deployment. Reloading the notes list resolves this automatically; no stored data migration is required.

## Known limitations

- Cursor pagination is stable continuation, not snapshot isolation.
- Search/filter scans at most the 200 most recent owned notes.
- Rate limiting is per warm Vercel instance, not globally distributed.
- Firestore Emulator does not fully enforce production composite indexes.
- Authenticated production acceptance and both Vercel Project settings require operator access.

This file prepares the GitHub Release notes. It does not assert that a tag or Release has been published.
