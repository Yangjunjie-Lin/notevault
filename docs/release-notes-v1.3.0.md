# NoteVault v1.3.0 — Visual AI Canvas

Released 2026-08-30.

NoteVault 1.3.0 adds a persistent visual conversation workspace that turns exploratory AI chat into an inspectable, branchable graph. It keeps NoteVault's core product rule intact: AI may propose content, but only the user can decide what becomes a note or action checkpoint.

## Product workflow

1. Open **AI Canvas** and start a private conversation.
2. Select any historical user or AI node and add a branch from that exact stage.
3. Inspect the graph visually or read the complete safe-Markdown message in the side panel.
4. Choose **Capture ideas** on a useful branch.
5. Review AI-proposed notes and checkpoints. Every candidate starts unchecked and can be edited or reclassified.
6. Select and save only the items that belong in NoteVault.
7. Complete or reopen checkpoints from the Canvas. Delete the graph when it is no longer needed; confirmed notes/checkpoints remain.

## Architecture and pipeline

- `conversations` stores the owned graph summary; `conversation_messages` stores immutable parent-linked nodes.
- A branch reply sends only the selected node's bounded ancestor path, never sibling or descendant branches.
- Provider generation completes before Firestore work begins. Each completed turn then writes its user node, assistant node, and conversation summary in one deterministic batch.
- Capture extraction returns a strict, bounded JSON envelope. Suggestions stay in review state and are not stored automatically.
- Confirmation writes only selected items, with deterministic IDs and one Firestore batch. Retrying the same confirmation cannot duplicate notes or checkpoints.
- `checkpoints` stores user-confirmed action items; `capture_batches` stores idempotency receipts.
- Deleting a Canvas removes its conversation, messages, and capture receipts. Confirmed notes/checkpoints remain independent records.

All browser traffic continues to terminate at the Firebase-authenticated FastAPI backend. Firebase UID, SiliconFlow credentials, provider URL, model, prompts, temperature, and token limits remain server-controlled.

## Interface

- Three-column desktop workspace: conversation library, connected graph, and message/checkpoint inspector.
- Zoom, fit, center, node selection, complete message rendering, and branch-point composer context.
- Existing NoteVault colors, spacing, typography, buttons, status/error patterns, and safe Markdown contract.
- Two-row tablet layout and a readable single-column semantic tree below 640px, without horizontal overflow.
- Keyboard-accessible controls, visible focus, reduced-motion support, dialog focus trapping, live status announcements, and axe-checked states.

## API additions

```text
GET    /conversations
POST   /conversations
GET    /conversations/{conversation_id}
DELETE /conversations/{conversation_id}
POST   /conversations/{conversation_id}/messages
POST   /conversations/{conversation_id}/suggestions
POST   /conversations/{conversation_id}/captures
GET    /checkpoints
PATCH  /checkpoints/{checkpoint_id}
```

Missing and cross-user resource identifiers share the same `404` behavior. Request schemas reject client-supplied UID/provider fields and enforce content, graph, candidate, and batch limits.

## Verification

- Frontend unit and integration coverage includes graph construction, branching, persistence adapters, capture review, zero-default selection, checkpoint changes, deletion, failures, and cross-view navigation.
- Backend coverage includes ownership isolation, strict extraction validation, ancestor-only context, deterministic writes, capture idempotency, deletion boundaries, provider failures, and authentication.
- Production-build Playwright covers Canvas creation, branching, reload rehydration, selective capture, retained approved records after graph deletion, mobile layout, and axe checks.
- Firestore Emulator integration, generated OpenAPI drift checks, release metadata checks, build verification, dependency audits, and production smoke remain release gates.
- Automated tests use a fake provider and never consume a real SiliconFlow key. A separate local smoke validates the configured provider with non-sensitive sample content.

## Upgrade and rollback

Deploy `firestore.indexes.json` before enabling the new frontend. The schema is additive and the existing note contract remains compatible. A rollback to v1.2 can leave the new collections in place because older clients do not query them; do not delete confirmed notes or checkpoints as part of an application rollback. Frontend and backend aliases should always return to mutually compatible deployments.

## Known limitations

- Provider responses are non-streaming.
- A graph is capped at 500 messages and provider context at 24 ancestors.
- The in-memory AI limiter is per warm serverless instance, not a distributed daily quota.
- There is no RAG, embedding/vector storage, cross-note memory, external search, autonomous tool calling, collaboration, or sharing in this release.
