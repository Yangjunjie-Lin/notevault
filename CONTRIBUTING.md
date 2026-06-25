# Contributing

Thank you for your interest in improving Personal Notebook.

## Development Workflow

1. Create a new branch from `main`.
2. Keep changes focused and easy to review.
3. Run the relevant checks before opening a pull request.
4. Update documentation when behavior, configuration, or setup steps change.

## Local Checks

Frontend:

```bash
npm run build:frontend
```

Backend:

```bash
python -m compileall backend/app
```

Security audit:

```bash
cd frontend
npm audit --omit=dev
```

## Pull Request Guidelines

- Describe the purpose of the change.
- Include screenshots for user interface changes.
- Mention any required environment variable changes.
- Keep unrelated refactors out of feature or bug-fix pull requests.

