# Security Policy

## Supported versions

Security fixes are maintained on the `main` branch for the current `1.2.x` release line.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, private note content, or provider responses. Contact the repository maintainer privately or create a GitHub private security advisory.

## Secrets management

Never commit:

- `.env` files or populated environment examples
- Firebase service-account JSON or private keys
- Firebase ID tokens, access tokens, or production credentials
- `CURSOR_SIGNING_KEY`
- `SILICONFLOW_API_KEY`

Production secrets belong in the backend deployment platform's encrypted environment variables. `FIREBASE_CREDENTIALS_JSON`, `CURSOR_SIGNING_KEY`, and every `SILICONFLOW_*` secret are configured only in the backend Vercel Project. The frontend Project and browser bundle must never contain a SiliconFlow credential. In particular, never introduce `VITE_SILICONFLOW_API_KEY`; Vite intentionally exposes `VITE_*` values to browser code.

Use a unique random `CURSOR_SIGNING_KEY` of at least 32 characters in production. Do not reuse Firebase or SiliconFlow credentials as an application signing key.

### SiliconFlow key exposure response

Treat a provider key as compromised if it is pasted into chat, committed, included in a build artifact, logged, placed in a frontend environment, or shared through an untrusted channel.

1. Revoke or delete the exposed key in SiliconFlow immediately.
2. Create a new key with the minimum required account access.
3. Replace `SILICONFLOW_API_KEY` in the backend Vercel Project and any ignored local `.env` that needs it.
4. Redeploy the backend; do not rebuild the frontend merely to rotate a server-only key.
5. Search Git history, CI logs, Vercel build/runtime logs, frontend assets, source maps, and test artifacts for the exposed value or a token-shaped `sk-...` value.
6. If the value entered Git history, follow the repository host's secret-removal procedure in addition to rotating it; rewriting history alone does not revoke the key.
7. Run the anonymous bundle scan and an authenticated AI smoke test, then review provider usage for unexpected activity.

Never put a real provider key into a test fixture, snapshot, OpenAPI example, issue, or release note. Automated tests mock SiliconFlow and do not require its secret.

## Authentication and authorization

The frontend obtains Firebase ID tokens through Firebase Authentication. FastAPI verifies each token with Firebase Admin SDK and derives the trusted UID server-side. All note and AI endpoints use that verified identity; request bodies cannot select or spoof a UID.

Cross-user and missing note IDs intentionally return the same `404`. Request models reject unknown fields. Playwright authentication is limited to Vite `e2e` mode and a separate test server module; an ordinary production build rejects the test-auth flag.

Pagination cursors are versioned, length-bounded, HMAC-SHA256 signed, and bound to the verified UID, query mode, and filter fingerprint. Rotating `CURSOR_SIGNING_KEY` intentionally invalidates outstanding cursors.

## AI trust boundary

The supported call chain is:

```text
Browser
  -> Firebase-authenticated NoteVault FastAPI backend
  -> SiliconFlow Chat Completions
```

The browser never calls SiliconFlow directly. When automatic formatting is used, the current note Markdown is sent to SiliconFlow. When AI Assist is used, the current Markdown candidate and the user's editing instruction are sent. Tags, Firebase bearer tokens, trusted UID values, service-account content, and the provider API key are not part of the provider request body.

SiliconFlow is a third-party processor that can receive request content. NoteVault does not describe this flow as local inference, zero knowledge, end-to-end encryption, complete anonymity, or guaranteed non-retention. Users must avoid AI processing for content they are not permitted to disclose to that provider.

### Prompt-injection boundary

Note text is untrusted data, not an intended instruction source. Backend-owned system prompts separate the note and, for revisions, the explicit user editing instruction. These boundaries reduce the chance that instructions embedded inside a note influence model behavior, but no prompt structure can guarantee policy compliance. Clients cannot provide the model, provider URL, temperature, maximum token count, system prompt, API key, or authorization header.

Prompt separation is one defense, not a claim that model output is inherently trustworthy. The backend trims and validates provider output, removes a clearly detected whole-response Markdown fence, rejects empty or oversized results, and maps provider failures to sanitized NoteVault errors. Users review formatting differences; AI Assist candidates require an explicit apply action and are not automatically saved.

## Input, output, and rendering controls

- Note Markdown and revision instructions have strict length and whitespace validation.
- Pydantic request and response models reject extra fields.
- AI output cannot change tags because tags are not part of AI requests or responses.
- Empty, malformed, or oversized provider output is rejected rather than truncated or saved.
- Provider completions are accepted only with a complete `stop` finish reason; length-truncated, filtered, or tool-call results are rejected.
- Both user and AI Markdown render through `react-markdown` and `remark-gfm` with raw HTML disabled and safe URL handling.
- Markdown images render as inert blocked placeholders so an AI candidate cannot trigger a third-party image request before review.
- Do not add `rehype-raw`, `dangerouslySetInnerHTML`, an alternate unsafe preview, or browser-side provider SDKs.
- Provider error bodies, Python tracebacks, environment variables, and authorization headers must never be returned to the browser.

## Logging and diagnostics

Application logs must not contain note bodies, AI editing instructions, Firebase bearer tokens, SiliconFlow authorization headers, provider keys, or full provider responses. Allowed AI diagnostics are limited to operational metadata such as request category, latency, sanitized error category, HTTP status, and an optional `x-siliconcloud-trace-id`.

Do not enable verbose HTTP logging in production when it could capture headers or request/response bodies. Scrub third-party exception text before it crosses the backend boundary.

## Rate limiting

Read, write, and AI budgets are separate and keyed only by the verified UID; they never store bearer tokens. AI formatting and revision share the configured AI budget. A `429` includes `Retry-After`.

On Vercel serverless, these in-memory counters are best-effort per warm instance. They are not a distributed or global abuse-control system and must not be represented as one. Provider-side quotas and billing controls remain independently necessary.

## Dependency and release hygiene

The AI transport uses the maintained, pinned `httpx` runtime dependency already represented in `backend/requirements.txt` and `backend/pyproject.toml`; no browser provider SDK or agent framework is required. Dependabot monitors Python, both npm workspaces, and GitHub Actions. Releases must run version-consistency checks, Python compilation/tests, npm audits, contract drift checks, browser tests, and repository secret checks before deployment.
