# Security Policy

## Supported Versions

This project is currently maintained on the `main` branch.

## Reporting a Vulnerability

If you discover a security issue, avoid opening a public GitHub issue with exploit details. Contact the repository maintainer privately, or create a private advisory if the repository is hosted on GitHub.

## Secrets Management

Never commit:

- `.env`
- Firebase service account JSON files
- Private keys
- Access tokens
- Production credentials

Use deployment platform environment variables for production secrets. Prefer `FIREBASE_CREDENTIALS_JSON` for backend deployments.

Use a unique random `CURSOR_SIGNING_KEY` of at least 32 characters in production. Do not reuse Firebase credentials as an application signing key.

On Vercel serverless, the in-memory rate limiter is best-effort per instance and must not be described as a distributed global rate limit.

## Authentication Model

The frontend obtains Firebase ID tokens through Firebase Authentication. The backend verifies those tokens with Firebase Admin SDK and scopes note operations by the verified Firebase user ID.

Cross-user and missing note IDs intentionally return the same 404. Request bodies reject extra fields, including `uid`.

Playwright authentication is limited to Vite `e2e` mode and a separate test server module. A production build rejects the test-auth flag, and the production FastAPI entrypoint does not import the test server.
