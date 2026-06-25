from pathlib import Path
import json
import logging

import firebase_admin
from firebase_admin import auth, credentials, firestore

from .config import BASE_DIR, ROOT_DIR, get_settings


logger = logging.getLogger(__name__)
_db = None


def _credential_file_candidates() -> list[Path]:
    settings = get_settings()
    candidates: list[Path] = []

    if settings.firebase_credentials_path:
        candidates.append(Path(settings.firebase_credentials_path).expanduser())

    candidates.extend(
        [
            BASE_DIR / "serviceAccountKey.json",
            ROOT_DIR / "serviceAccountKey.json",
        ]
    )
    return candidates


def _initialize_firebase() -> None:
    if firebase_admin._apps:
        return

    settings = get_settings()
    if settings.firebase_credentials_json:
        try:
            credential_data = json.loads(settings.firebase_credentials_json)
        except json.JSONDecodeError as exc:
            raise RuntimeError("FIREBASE_CREDENTIALS_JSON is not valid JSON") from exc

        firebase_admin.initialize_app(credentials.Certificate(credential_data))
        logger.info("Initialized Firebase from FIREBASE_CREDENTIALS_JSON")
        return

    for credential_path in _credential_file_candidates():
        if credential_path.exists():
            firebase_admin.initialize_app(credentials.Certificate(str(credential_path)))
            logger.info("Initialized Firebase from %s", credential_path)
            return

    searched = ", ".join(str(path) for path in _credential_file_candidates())
    raise RuntimeError(
        "Firebase credentials were not found. Set FIREBASE_CREDENTIALS_JSON, "
        "set FIREBASE_CREDENTIALS_PATH, or place serviceAccountKey.json in backend/. "
        f"Searched: {searched}"
    )


def get_firestore_client():
    global _db

    if _db is None:
        _initialize_firebase()
        _db = firestore.client()

    return _db


def verify_firebase_token(token: str) -> dict:
    _initialize_firebase()
    return auth.verify_id_token(token)

