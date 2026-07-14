# NoteVault Architecture

This document is the engineering map for extending NoteVault without weakening its authentication, ownership, or UI-state guarantees.

## System boundaries

~~~mermaid
flowchart LR
  UI["React + TypeScript UI"] --> Auth["Firebase Web Auth"]
  UI --> API["FastAPI notes API"]
  API --> Verify["Firebase Admin token verification"]
  Verify --> Store["Cloud Firestore"]
  API --> Limit["Per-user rate limiter"]
~~~

The browser never talks to Firestore directly. Firebase Web Auth establishes the user session and issues an ID token. The note API attaches that token to each request. FastAPI verifies it, derives the trusted user ID, rate-limits the operation, and scopes all reads and writes to that ID.

## Frontend module boundaries

~~~text
src/
|-- app/
|   |-- App.tsx            # Composition, auth session, request lifecycle
|   `-- App.test.tsx       # User-workflow integration coverage
|-- features/
|   |-- auth/
|   |   |-- firebase.ts    # Firebase adapter
|   |   `-- components/    # Header and signed-out landing
|   `-- notes/
|       |-- api.ts         # Authenticated HTTP adapter
|       |-- types.ts       # Shared note contracts
|       `-- components/    # Composer, toolbar, cards, empty state
|-- shared/components/     # Dialog, error banner, loading skeleton
|-- styles/app.css         # Tokens, layout, states, responsive rules
`-- main.tsx               # React bootstrap only
~~~

Rules:

- The app layer may compose features; feature components do not import the app.
- HTTP and Firebase SDK calls stay in adapters, not presentation components.
- Domain contracts live in features/notes/types.ts; do not duplicate note shapes.
- Shared components stay domain-neutral.
- The composition root owns cross-feature state such as the current user, active filters, network errors, and delete confirmation.

## Note query lifecycle

Every authenticated user or filter change starts one note query. The previous request is aborted during effect cleanup. This ensures a slower old search cannot replace the result of a newer search. Loading state is cleared only by the request that is still active.

Newly created notes are inserted locally only when they match the active filters. Deletion is applied locally only after the API confirms success. Failed creates preserve the draft; failed deletes preserve the note.

## Interaction contract

The production UI supports:

- Google sign-in and sign-out
- Markdown write and preview modes
- note body and tag constraint feedback
- note creation with pending and error states
- full-text and exact-tag search
- clear filters from the toolbar or filtered empty state
- one-click filtering from a note tag
- two-step deletion with Escape, backdrop, focus trap, focus restore, and scroll lock
- dismissible global errors
- desktop, tablet, mobile, keyboard, and reduced-motion behavior

Any new visible action must include a real handler, a pending or disabled policy when asynchronous, an error path, and an integration test.

## Backend guarantees

- Pydantic normalizes body text and tags at the API boundary.
- Authentication derives the UID from a verified token; clients cannot submit a UID.
- Reads query by UID and then apply optional text and tag filters.
- Deletes return 404 for missing notes and notes owned by another user, avoiding ownership disclosure.
- Production CORS rejects wildcard origins.

## Quality gate

Run npm run check before opening a pull request. Activate the repository Python virtual environment first so the pinned backend dependencies are used.
