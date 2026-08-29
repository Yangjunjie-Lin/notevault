# AI privacy and data handling

NoteVault's AI features send note content to a third-party model provider. This document describes the application boundary; it is not a substitute for reviewing SiliconFlow's current terms and privacy policy.

## Processing disclosure

> When an AI feature is submitted, the relevant note draft or selected AI Canvas branch is sent from the NoteVault backend to SiliconFlow for processing.

The provider call is not local inference. NoteVault does not claim that AI requests are zero-knowledge, end-to-end encrypted from the provider, completely anonymous, or guaranteed never to be retained. Users should not submit content they are not authorized to disclose to SiliconFlow.

## What each action sends

| User action | Sent to NoteVault backend | Forwarded to SiliconFlow | Persisted by NoteVault |
| --- | --- | --- | --- |
| Add / save with automatic formatting | Current Markdown draft; Firebase bearer token to authenticate NoteVault | Current Markdown draft plus backend-owned formatting prompt | Only the version the user explicitly saves; token and AI exchange are not stored |
| AI Assist revision | Current Markdown candidate, explicit editing instruction; Firebase bearer token to authenticate NoteVault | Current Markdown candidate, explicit editing instruction, backend-owned editor prompt | Candidate/instruction remain temporary frontend session state; no AI conversation is written to Firestore |
| AI Canvas start / branch reply | New message, selected parent message ID, idempotency key; Firebase bearer token to authenticate NoteVault | New message and up to 24 messages on the selected ancestor path, plus the backend-owned conversation prompt | Completed user and assistant messages, parent links, timestamps, title, and owner UID are stored in Firestore |
| AI Canvas **Capture ideas** | Selected source message ID and capture intent | Up to 24 messages on the selected ancestor path, plus the backend-owned extraction prompt | Suggestions remain review-only response state; they are not materialized automatically |
| Confirm **Save selected** | Only checked, user-editable note/checkpoint items | Nothing further | Selected notes and checkpoints are stored with source conversation/message provenance; unchecked items are not stored |
| Delete conversation map | Owned conversation ID | Nothing | Conversation, message graph, and capture receipts are removed; previously confirmed notes/checkpoints are retained |
| Save Original after formatter failure/review | Original Markdown and unchanged tags to the normal notes API | Nothing further for that save choice | Original note is stored through the normal note contract |
| Discard / close / cancel | No new provider data after cancellation | An already transmitted request may already have reached the provider | Candidate/session state is cleared; note is not changed by that action |

The Firebase bearer token is sent only to NoteVault and is not forwarded to SiliconFlow. The backend sends its separate SiliconFlow authorization header directly to the provider.

## Data excluded from provider requests

- Note tags
- Trusted Firebase UID
- Firebase ID token
- Firebase service-account credentials
- Cursor signing key
- SiliconFlow API key inside the JSON body
- Firestore document metadata and other users' notes
- Sibling or descendant Canvas branches outside the selected node's ancestor path
- Unchecked or canceled capture candidates

Because note text itself may contain identifiers or sensitive facts, excluding account metadata does not make the request anonymous.

## User control and draft safety

AI processing occurs only after a user initiates save formatting or submits an AI Assist instruction; it does not run on every keystroke.

- Formatting differences are reviewable before save.
- Users can save the original draft instead of formatted output.
- Provider failure never clears the draft or substitutes empty output.
- AI Assist output is a candidate until explicitly applied.
- Applying a candidate changes only the local draft and does not save it.
- Tags remain outside the AI flow.
- Closing/canceling clears temporary UI state and active requests are canceled where possible.
- Canvas capture candidates start unchecked; the confirm action is disabled until at least one complete item is selected.
- Canvas messages are immutable graph records. Replying from an older message creates a child branch instead of rewriting history.

Network cancellation cannot guarantee recall of data already received by the provider. Do not submit a request if the content must not cross the provider boundary.

## NoteVault storage and logging

Normal note text and tags are stored in Firestore only after an explicit save action. Version 1.3.0 also stores authenticated AI Canvas conversations, parent-linked user/assistant messages, user-confirmed checkpoints, and capture idempotency receipts. Structured capture suggestions are not stored unless the user selects and confirms them. Composer AI Assist instructions and temporary candidates remain browser state.

Conversation messages are provider inputs/outputs as well as application records. Signing out does not delete them. Users can permanently delete an owned Canvas graph from the Canvas; this removes its messages and capture receipts but retains notes/checkpoints they previously confirmed. Deleting a captured note affects that note only; completing a checkpoint changes its status but retains source provenance. Operators must treat the new collections as private user content and include them in retention, export, incident-response, and deletion planning.

Application logs must not contain:

- Note text or AI candidates
- User editing instructions
- Firebase bearer tokens or trusted UID payloads copied from tokens
- SiliconFlow authorization headers or API keys
- Full provider requests, responses, or raw error bodies

Allowed operational metadata is limited to request category, duration, sanitized error category, HTTP status, and optional `x-siliconcloud-trace-id`. Operators must keep verbose HTTP body/header logging disabled.

This no-application-log policy does not describe or guarantee SiliconFlow's own retention behavior. Review the provider's current policies and account controls independently.

## Security controls

- Firebase authentication protects both AI endpoints.
- Request bodies have strict lengths and reject unknown fields.
- Provider/model parameters and prompts are server-controlled.
- The note is treated as untrusted prompt data.
- Empty, malformed, prohibited, and oversized output is rejected rather than saved or truncated.
- AI Markdown uses the existing raw-HTML-disabled renderer.
- Remote Markdown images render as blocked placeholders rather than issuing third-party browser requests.
- AI requests have a separate per-verified-UID budget.
- Provider errors are mapped to sanitized application messages.
- The API key exists only in backend configuration and never in a `VITE_*` variable.

The per-UID limiter is in-memory per warm Vercel instance. It is not a global privacy, abuse, or billing guarantee.

## Handling sensitive notes

Before using either AI feature, consider whether a note contains personal data, credentials, confidential work, regulated information, source code that cannot be shared, or third-party information. Use **Save Original** or avoid AI Assist when disclosure to the provider is not appropriate.

Do not place passwords, API keys, private keys, session tokens, medical records, financial account data, or another person's confidential data into an AI request. Automatic formatting is part of the normal save action in this release, but its review/failure flow preserves an explicit save-original path.

## Provider key handling

`SILICONFLOW_API_KEY` belongs only in an ignored backend `.env` or the backend deployment Project's encrypted environment. It must not appear in documentation, Git history, frontend environment variables, network requests from the browser, logs, errors, snapshots, OpenAPI examples, source maps, or bundles.

If a real key is pasted into chat or otherwise exposed, revoke it before use and issue a replacement. Rotation steps are documented in [../SECURITY.md](../SECURITY.md).

## Operator privacy checklist

- Confirm the frontend shows a clear SiliconFlow processing disclosure for Composer and Canvas AI actions.
- Confirm Vercel frontend settings contain no `SILICONFLOW_*` or equivalent provider secret.
- Scan built/deployed assets for provider-secret names, direct provider endpoints, and token-shaped strings.
- Confirm CORS allows only the exact frontend origin.
- Confirm unauthenticated `/ai/*`, `/conversations*`, and `/checkpoints*` requests return `401` and no provider call occurs.
- Review backend logs for metadata-only AI diagnostics.
- Verify provider account access, quotas, billing alerts, and current retention/privacy terms.
- Use non-sensitive disposable content for production smoke tests and delete the resulting note.

## Scope limitations

Composer AI Assist sessions remain temporary; AI Canvas conversations are persistent and non-streaming. NoteVault provides no RAG, embeddings, cross-note memory, vector store, external search, autonomous tools, analytics reuse, or model training use. Adding any of those capabilities or another provider would change this privacy boundary and requires an explicit documentation, schema, security, and consent review.
