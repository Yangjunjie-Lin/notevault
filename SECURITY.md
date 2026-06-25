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

## Authentication Model

The frontend obtains Firebase ID tokens through Firebase Authentication. The backend verifies those tokens with Firebase Admin SDK and scopes note operations by the verified Firebase user ID.

