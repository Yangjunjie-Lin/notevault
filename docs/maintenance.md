# NoteVault maintenance policy

## Project status

```text
Stable
Feature-complete
Production deployed
Maintenance mode
Portfolio flagship
```

NoteVault is a feature-complete, production-oriented Markdown notebook with Firebase-authenticated user isolation, a typed FastAPI contract, mutation-safe timeline cursor pagination, bounded offset pagination for filtered search, bounded Firestore access, and automated cross-browser quality gates.

Production status is a two-boundary claim: both `notevault` and `notevault-api` must be Ready and the release smoke checklist must pass. A single Vercel status is insufficient.

## Future changes allowed

- Security vulnerabilities and credential-handling fixes
- Browser, Firebase, FastAPI, Vite, Node, or Python compatibility
- Dependency support and end-of-life maintenance
- Reproducible user-reported bugs
- Tested accessibility improvements
- Measured performance, reliability, or availability improvements

## Out of scope

- AI features, chat, collaboration, sharing, or notifications
- Attachments, rich text, or offline synchronization
- Subscriptions, payment, advertising, or analytics tracking
- Microservices, Redis, external search services, or new global state frameworks

## Release checklist

- [ ] `npm ci` and `npm --prefix frontend ci`
- [ ] `npm run typecheck:frontend`
- [ ] `npm run test:frontend` and `npm run test:coverage`
- [ ] `python -m compileall backend/app`
- [ ] `npm run test:backend:coverage`
- [ ] `npm run contract:check`
- [ ] Production-build E2E: Chromium full, Firefox smoke, WebKit smoke, mobile viewport smoke, and axe
- [ ] `npm run test:firebase-integration`
- [ ] `python scripts/production_smoke.py`
- [ ] Frontend `notevault` deployment is Ready with the expected root/build/output settings
- [ ] Backend `notevault-api` deployment is Ready with `app.main:app`
- [ ] Firestore composite index reports Enabled
- [ ] Firebase Authorized Domains contains `notevault-lovat.vercel.app`
- [ ] Authenticated create/refresh/preview/filter/edit/delete/pagination smoke completed
- [ ] No `.env`, `.vercel/`, service account, private key, token, or test artifact is tracked
- [ ] Changelog, version, tag, and GitHub Release agree

## Database changes

1. Preserve read compatibility before changing a stored field.
2. Run migration scripts in dry-run mode and record affected counts.
3. Deploy `firestore.indexes.json` and wait until every index is Enabled.
4. Apply the migration, run Emulator integration, then production smoke.
5. Roll back application aliases first if production validation fails. Restore data only from an operator-reviewed backup or reversible migration plan.

Firestore Emulator verifies real SDK serialization and query behavior but does not fully reproduce production composite-index enforcement. Firebase Console remains the authoritative index-status check.

## Cursor changes

- Cursor version changes require tamper, UID, mode, filter, ordering, and mutation tests.
- Version 2 timeline cursors sign `createdAt` and document ID and continue by field values, never by rereading a boundary snapshot.
- Timeline cursor pagination provides stable continuation keys across edits and boundary deletion, not a frozen database snapshot.
- Filtered search scans a bounded recent-note set and continues by signed offset. Concurrent matching additions or removals can shift later filtered pages, so filtered search does not claim snapshot consistency.
- Short-lived old cursor versions may be invalidated. Reloading the first page is the supported client recovery.
- Key rotation invalidates existing cursors and must be called out in release notes.

## Security maintenance

- Run `npm audit`, `npm audit --omit=dev`, and review Python outdated packages before release.
- Keep Admin service-account JSON only in the backend Vercel secret or an ignored local file.
- Never log bearer tokens, cursor signing keys, private note text, or service-account content.
- Keep exact production CORS; wildcard origins remain forbidden.
- Use a unique `CURSOR_SIGNING_KEY` of at least 32 characters and rotate it deliberately.
- Keep test auth exclusive to Vite `e2e` mode and test routes exclusive to `tests.e2e_app`.

## Rate limiting

Read and write budgets are separate and keyed by verified UID. The limiter is in-memory per warm serverless instance, is resettable in tests, and returns `Retry-After` on 429. It is not a distributed or global abuse-control system; that limitation is accepted to avoid adding Redis or a paid dependency.

## Browser maintenance

Chromium runs the full suite. Firefox and WebKit run the same core smoke, including the maintained mobile viewport check. The current Windows administrator-session Firefox runtime can fail before page creation with Playwright's known `browserContext.newPage` issue; Ubuntu CI is the release authority for Firefox until that upstream/environment limitation is resolved. This exception must never be converted into a skipped CI project.

## Production acceptance

Anonymous automation checks frontend HTML/assets, backend health/docs/OpenAPI, unauthenticated 401 behavior, exact CORS, and absence of local/test bundle markers. Authenticated Google sign-in remains an operator checklist because CI has no production user token.

For authenticated acceptance: sign in, create a temporary Markdown note, refresh, preview, search/filter, edit, exercise both unsaved/delete dialogs, create or use 25+ notes, delete the page-one boundary, Load more, verify no duplicates, sign out/in, verify user isolation, and remove temporary data.
