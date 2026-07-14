# Contributing

Create a focused branch from `main`, preserve the existing NoteVault design language, and keep authentication/HTTP out of presentation components. Update OpenAPI-generated types and documentation whenever API behavior changes.

Run before opening a pull request:

```bash
npm ci
npm --prefix frontend ci
npm run typecheck:frontend
npm run test:frontend
npm run test:coverage
npm run build:frontend
npm run test:e2e

python -m pip install -r backend/requirements-dev.txt
python -m compileall backend/app
npm run test:backend:coverage
npm run contract:check
```

Do not commit `.env`, `.vercel/`, service account files, private keys, tokens, Playwright output, or coverage artifacts. Explain required indexes, migrations, environment changes, and production impact in the PR. Include screenshots for visible UI changes and verify mobile/keyboard behavior.
