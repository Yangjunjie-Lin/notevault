# NoteVault v1.2.0 — AI Markdown Assistant

NoteVault 1.2.0 adds reviewable Markdown formatting and controlled AI revision to the existing Composer. DeepSeek V4 Flash is accessed through SiliconFlow by the authenticated FastAPI backend; the browser never receives the provider key or calls the provider directly.

## Highlights

- **Formatting before save:** **Add note** and **Save changes** run one Markdown normalization request after local validation. Changed text is reviewed before persistence; unchanged text saves directly.
- **Draft-preserving recovery:** formatting failure keeps the original content and offers retry, explicit save-original, or cancel actions.
- **AI Assist in the Composer:** users can request revisions, inspect preview/source, continue from the prior candidate, retry, discard, close, and explicitly apply a candidate to the current draft.
- **No implicit AI save:** a revision candidate does not overwrite the editor or Firestore. Applying it still requires the normal save flow and final formatting check.
- **Tags stay outside AI:** formatting and revision contracts contain Markdown text only (plus the explicit revision instruction), so tags remain unchanged.
- **Typed, authenticated contract:** Firebase-authenticated `/ai/format-markdown` and `/ai/revise-note` schemas are generated from FastAPI OpenAPI.

## Security and privacy

When either AI feature is used, the current note draft is sent from NoteVault's backend to SiliconFlow. AI Assist also sends the explicit editing instruction. This is third-party processing, not local inference or a zero-knowledge flow.

`SILICONFLOW_API_KEY` is a backend-only secret. The frontend has no provider SDK, provider key, or direct Chat Completions request. Backend prompts isolate untrusted note data, incomplete finish reasons and invalid output are rejected, errors are sanitized, remote Markdown images are blocked, and existing safe Markdown rendering remains in force.

NoteVault does not log note bodies, AI instructions, provider authorization, or full provider responses. AI requests use a separate budget keyed by verified Firebase UID. The limiter is best-effort per warm Vercel instance, not distributed globally.

## Dependency and contract changes

- Adds pinned `httpx==0.27.2` to the backend runtime for async HTTPS, explicit timeouts, cancellation, response validation, and bounded retries.
- Adds no agent framework, provider browser SDK, global state framework, heavy Markdown editor, or diff package.
- Updates root/frontend packages and lockfiles, backend metadata, OpenAPI metadata, the README badge, environment template, changelog, and release checks to `1.2.0`.
- Automated provider tests use mocks and do not require or permit a live key in ordinary CI.

## Deployment upgrade

No note or Firestore migration is required. Deploy the backend before the frontend and configure these variables only in the backend `notevault-api` Vercel Project:

```dotenv
SILICONFLOW_API_KEY=YOUR_SILICONFLOW_API_KEY_HERE
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=deepseek-ai/DeepSeek-V4-Flash
SILICONFLOW_TIMEOUT_SECONDS=45
SILICONFLOW_MAX_TOKENS=4096
SILICONFLOW_AI_RATE_LIMIT_PER_MINUTE=10
```

Do not configure the provider key in the frontend `notevault` Project or under a `VITE_*` name. If a key has appeared in chat, logs, source control, or any frontend setting/artifact, revoke it and use a new key.

After deployment, verify both Vercel Projects use the same commit, scan frontend assets for provider material, run `python scripts/production_smoke.py`, and complete the authenticated AI acceptance flow with a non-sensitive disposable note. See [deployment.md](deployment.md).

## Compatibility and rollback

Existing notes, tags, timestamps, pagination cursors, and Firestore indexes keep their v1.1 behavior. AI candidates and sessions are not persisted. Rolling back v1.2.0 requires no AI-data migration, but both frontend and backend aliases should return to mutually compatible deployments.

A missing or unavailable provider does not prevent application startup or ordinary note reads/writes. AI endpoints return sanitized failures; the formatter UI preserves the original draft and provides an explicit save-original path.

## Known limitations

- The AI limiter is per warm Vercel instance, not a global distributed quota.
- SiliconFlow availability, quota, latency, and configured model availability affect both AI workflows.
- AI Assist sessions are current-browser-session state and are not persisted.
- Responses are non-streaming.
- This release has no RAG, embeddings, vector database, tool calling, external search, or general-purpose knowledge chat.
- Provider data-handling and retention are governed by SiliconFlow's current policies; NoteVault makes no non-retention guarantee.
- At the 2026-08-06 verification, the latest `firebase-tools` (`15.25.1`) still brought five moderate development-only transitive advisories through `@google-cloud/pubsub`/OpenTelemetry and `gaxios`/`uuid`. Root production audit and both frontend audits pass after the non-breaking lock refresh. A forced Firebase CLI downgrade or untested major transitive override was not applied; track the upstream CLI dependency before the next release.

This file prepares GitHub Release text. It does not assert that a tag or GitHub Release has been published.
