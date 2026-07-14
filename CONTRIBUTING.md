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
npm run test:firebase-integration

python -m pip install -r backend/requirements-dev.txt
python -m compileall backend/app
npm run test:backend:coverage
npm run contract:check
```

`npm run verify` runs the maintained local release gates. Node 20–22 and Python 3.12–3.13 are the verified ranges. Use the Windows or Linux/macOS virtual-environment commands in README; root scripts invoke Python as a module and do not require a global `uvicorn` executable.

Do not commit `.env`, `.vercel/`, service account files, private keys, tokens, Playwright output, emulator logs, or coverage artifacts. Explain required indexes, migrations, environment changes, and production impact in the PR. Include screenshots for visible UI changes and verify mobile/keyboard behavior. Feature proposals outside [docs/maintenance.md](docs/maintenance.md) are intentionally out of scope.
