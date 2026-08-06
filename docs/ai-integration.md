# AI integration

NoteVault v1.2.0 integrates DeepSeek V4 Flash through SiliconFlow for two narrowly scoped Markdown workflows. It is not a general chat or autonomous-agent system.

## Supported workflows

### Automatic Markdown formatting

After a user selects **Add note** or **Save changes**, the frontend validates the draft locally and asks the authenticated backend to normalize its Markdown. Formatting may repair headings, lists, spacing, blockquotes, code fences, and existing tables without adding facts, translating, answering questions, changing code/URLs/quotes, or modifying tags.

An identical result proceeds to normal note persistence. A changed result is reviewable as Original and Formatted. The user chooses **Apply & Save**, **Save Original**, or **Cancel**. Provider failure preserves the draft and offers retry, explicit save-original, or cancel paths.

### AI Assist revision

The Composer's AI Assist panel accepts an explicit editing instruction and returns a complete Markdown candidate. The candidate remains temporary and cannot overwrite the editor or database until **Apply to draft** is selected. Applying marks the ordinary Composer draft dirty; it does not save it.

Subsequent revision instructions use the previous AI candidate. Closing, discarding, resetting, switching notes, canceling edit, or signing out cancels active requests and clears temporary state. A candidate generated from an older source draft cannot silently overwrite a newer draft.

## Provider contract

NoteVault uses SiliconFlow's official non-streaming Chat Completions endpoint:

```text
POST https://api.siliconflow.cn/v1/chat/completions
Authorization: Bearer <backend SILICONFLOW_API_KEY>
Content-Type: application/json
```

The default server-selected model is `deepseek-ai/DeepSeek-V4-Flash`. Requests use `stream: false`, `n: 1`, the configured `max_tokens`, formatter temperature `0.1`, and revision temperature `0.2`. The initial release does not send unverified reasoning parameters, `top_p`, tools, images, structured output, or streaming fields.

Reference: [SiliconFlow Chat Completions](https://api-docs.siliconflow.cn/docs/api/chat-completions-post).

## Backend-only configuration

```dotenv
SILICONFLOW_API_KEY=YOUR_SILICONFLOW_API_KEY_HERE
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=deepseek-ai/DeepSeek-V4-Flash
SILICONFLOW_TIMEOUT_SECONDS=45
SILICONFLOW_MAX_TOKENS=4096
SILICONFLOW_AI_RATE_LIMIT_PER_MINUTE=10
```

These variables belong only in an ignored backend `.env` or the backend Vercel Project. The frontend must not use a `VITE_*` provider variable. A missing key does not block application startup or ordinary note features; AI endpoints return a sanitized configuration error.

Base URL, timeout, token limit, and AI rate limit are validated at startup. Base URLs are normalized without a trailing slash. `Settings.__repr__` reports only whether a key is configured and never its value.

## NoteVault API contract

Both endpoints require a valid Firebase ID token. FastAPI derives the trusted UID from that token and rejects unknown request fields. OpenAPI declares the Firebase HTTP Bearer scheme plus the stable `401`, `422`, `429`, `502`, `503`, and `504` responses; `429` documents `Retry-After`.

### Format Markdown

```http
POST /ai/format-markdown
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{"text":"raw markdown"}
```

```json
{
  "text": "formatted markdown",
  "changed": true,
  "model": "deepseek-ai/DeepSeek-V4-Flash",
  "traceId": "optional-trace-id"
}
```

### Revise note

```http
POST /ai/revise-note
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{"text":"current markdown candidate","instruction":"Make this more concise."}
```

```json
{
  "text": "complete revised markdown",
  "model": "deepseek-ai/DeepSeek-V4-Flash",
  "traceId": "optional-trace-id"
}
```

Clients cannot submit a UID, API key, model, provider URL, temperature, maximum tokens, system prompt, or authorization header in these bodies. FastAPI OpenAPI is the source of truth; generate and check the committed frontend types with `npm run contract:generate` and `npm run contract:check`.

## Prompt isolation

Formatter and editor prompts are centralized in the backend. Both identify the note as untrusted data inside explicit delimiters. Revision requests separately delimit the permitted user editing instruction. This structure asks the model to treat instruction-like note text as data and reduces prompt-injection risk, but it cannot guarantee that such text will never influence the output or supersede the intended policy.

Prompt isolation reduces risk but does not make model output trusted. The backend validates the result and the user controls whether it reaches a draft or saved note.

## Output validation

The service requires a non-empty string from the first provider choice with `finish_reason: stop`, trims surrounding whitespace, removes only a clearly detected whole-response Markdown fence, and rejects malformed, filtered, tool-call, length-truncated, empty, or oversized output. It never silently truncates a response.

Internal fenced code blocks are preserved. AI text is rendered only through NoteVault's existing safe Markdown path with raw HTML disabled. Remote Markdown images are replaced by inert placeholders so rendering a candidate cannot make an automatic third-party image request. No endpoint accepts or returns tags, so AI cannot mutate them.

## Retry, errors, and cancellation

Only explicit transient failures—provider `429`, `503`, `504`, connect errors, and read timeouts—receive a small bounded retry with capped backoff and valid `Retry-After` handling. `SILICONFLOW_TIMEOUT_SECONDS` is one end-to-end deadline shared by all attempts and backoff, not a fresh timeout per retry. Provider `400`, `401`, `403`, `404`, request validation failures, and malformed responses are not automatically retried. One UI action cannot start an unbounded billing loop.

Public error mapping is stable and sanitized:

| Condition | NoteVault response |
| --- | --- |
| Provider `400` | `502 AI provider rejected the request` |
| Provider `401` / `403` | `503 AI service configuration error` |
| Provider `404` | `503 Configured AI model is unavailable` |
| Provider `429` | `429 AI service rate limit reached` |
| Provider `503` / `504` | `503 AI service is temporarily unavailable` |
| Network timeout | `504 AI request timed out` |
| Malformed provider response | `502 AI provider returned an invalid response` |
| Missing local API key | `503 AI service is not configured` |

Frontend adapters accept `AbortSignal`. Controllers use request versions so a canceled or stale provider response cannot update another note or a closed session.

## Rate limiting

Formatting and revision share a distinct AI request budget keyed by the verified Firebase UID. The browser cannot choose that UID, and the limiter does not retain its bearer token. A local `429` includes `Retry-After`.

Vercel serverless counters are in-memory per warm instance. They are not global or distributed; provider quotas and billing safeguards are still required.

## Dependency rationale

The backend adds pinned `httpx==0.27.2` as a runtime dependency because provider calls require async HTTPS, explicit timeout handling, cancellation, response validation, and controlled retry behavior. It is declared consistently in `backend/requirements.txt` and `backend/pyproject.toml`; development requirements inherit it.

No LangChain, LlamaIndex, agent runtime, provider browser SDK, global frontend state framework, heavy editor, or diff package is introduced. Dependabot already monitors backend Python dependencies.

## Testing

Automated tests mock SiliconFlow. They must never use a real key or make a live provider request. Backend tests cover authentication, request validation, prompts, provider payload/response handling, retry limits, sanitized errors, configuration, and per-UID limits. Frontend and browser tests cover review/apply/fallback paths, candidate state, cancellation, stale responses, conflict protection, keyboard/focus behavior, safe rendering, and tag preservation.

Run the maintained gates from the repository root:

```bash
npm run check
npm run test:e2e
npm run test:firebase-integration
npm run release:check
```

See [deployment.md](deployment.md) for production configuration and smoke checks, and [ai-privacy.md](ai-privacy.md) for the data boundary.

## Current limitations

- AI sessions are not persisted.
- Responses are non-streaming.
- Provider availability and quota affect both AI workflows.
- Save-original fallback always requires an explicit user decision.
- There is no RAG, embedding, vector storage, external search, tool calling, or general knowledge assistant.
