# NoteVault architecture

## Trust boundaries

```mermaid
flowchart LR
  UI["React UI"] --> Auth["Firebase Web Auth"]
  UI --> Adapter["Authenticated notes API adapter"]
  Adapter --> API["FastAPI"]
  API --> Verify["Firebase Admin token verification"]
  Verify --> UID["Trusted UID"]
  UID --> Limit["Per-user rate limit"]
  Limit --> Store["Cloud Firestore"]
```

The browser never supplies a trusted UID and never accesses Firestore directly. FastAPI verifies the bearer token, derives the UID, and applies it to every query and ownership check. Missing and cross-user note IDs both return 404.

## Frontend boundaries

```text
src/app/App.tsx                         composition, auth, confirmations
src/features/auth/firebase.ts          production Firebase/test-mode adapter
src/features/notes/api.ts              authenticated HTTP adapter
src/features/notes/generated.ts        generated OpenAPI schema types
src/features/notes/types.ts            aliases plus UI-only filter types
src/features/notes/hooks/useNotes.ts   pages, aborts, dedupe, mutations
src/features/notes/components/         presentation and composer state
src/shared/components/                 accessible feedback/dialog primitives
src/styles/app.css                     existing NoteVault design system
```

Presentation components do not call Firebase or HTTP. `useNotes` owns the active first-page request and a separate abortable pagination request. A monotonic request version prevents an older page from merging after a user, search, or tag change. Merge-by-ID deduplicates overlapping pages.

The Composer remains in the original left panel. Its mode is derived from the selected note; failed saves retain the local draft. App-level intent state handles cancel, another Edit action, and sign-out when the draft is dirty. The shared dialog provides focus trap, Escape, focus restore, backdrop handling, scroll lock, and disabled pending behavior.

## Data contracts

FastAPI is the schema source. `backend/scripts/export_openapi.py` writes deterministic `backend/openapi.json`; `openapi-typescript` generates `frontend/src/features/notes/generated.ts`. CI regenerates both and rejects a diff.

`NoteOut.updatedAt` is nullable so legacy notes remain valid. Current updates preserve `createdAt` and set millisecond `updatedAt`.

## Query paths

### Unfiltered list

```text
where uid == verified UID
order by createdAt descending
order by document ID descending
limit requested limit + 1
```

The extra document determines `hasMore`. A version 2 HMAC-SHA256 cursor contains mode, verified UID, filter fingerprint, last document ID, and normalized creation time. The next request validates those signed fields and calls `start_after({createdAt, __name__})`; it never rereads the boundary snapshot. Version 1 cursors return 400 and a first-page reload recovers automatically.

### Search or tag filter

Firestore cannot provide arbitrary substring search. The API queries at most 201 recent owned documents, uses the first 200 as a hard scan cap, normalizes timestamps, filters, and pages the bounded result. `searchLimited` is true when the cap was reached. A filtered cursor stores a signed offset and is bound to the normalized filters.

## Concurrent mutation semantics

Cursor pagination provides stable continuation keys, not a frozen database snapshot.

- A newly created note can merge at the current UI top; an older cursor is not required to include it.
- Deleting a loaded note, including the boundary note, does not invalidate continuation. Deleted notes are removed locally and are not returned again.
- Editing text or tags preserves `createdAt`, so the note keeps its chronological position. If it no longer matches active filters, the client removes it.
- Multiple devices may change the database between requests. The client merges by ID, rejects stale filter responses, and never renders duplicate note IDs.
- Search/tag cursors are signed against the normalized filter fingerprint. Because filtered pagination uses a bounded offset over a newly read recent set, concurrent filtered mutations do not provide snapshot isolation.

## Test authentication

The frontend test adapter activates only when both `MODE=e2e` and `VITE_TEST_AUTH=true`; Vite config rejects that flag in ordinary production mode before bundling. Playwright builds the optimized E2E bundle, serves it with Vite preview, and starts `tests.e2e_app:app` from an isolated global setup. Reset/seed routes exist only in that test module. The production entrypoint `app.main:app` never imports it, and CI stores no real token or Firebase credential.

The Firestore Emulator suite uses the real Google Cloud Firestore client and validates ordering, document-reference cursors, Timestamp conversion, owner isolation, update/delete, and boundary deletion. The emulator does not fully reproduce production composite-index enforcement, so deployment still requires checking `firestore.indexes.json` in Firebase Console.
