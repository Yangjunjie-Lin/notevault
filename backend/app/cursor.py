import base64
import hashlib
import hmac
import json
from typing import Any

from fastapi import HTTPException, status

from .config import get_settings


MAX_CURSOR_LENGTH = 2048


def encode_cursor(payload: dict[str, Any]) -> str:
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    encoded = _b64encode(body)
    signature = hmac.new(_key(), encoded.encode("ascii"), hashlib.sha256).digest()
    return f"{encoded}.{_b64encode(signature)}"


def decode_cursor(cursor: str) -> dict[str, Any]:
    if not cursor or len(cursor) > MAX_CURSOR_LENGTH:
        raise _invalid_cursor()

    try:
        encoded, provided_signature = cursor.split(".", 1)
        expected_signature = hmac.new(
            _key(), encoded.encode("ascii"), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(_b64decode(provided_signature), expected_signature):
            raise ValueError("invalid signature")
        payload = json.loads(_b64decode(encoded))
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise _invalid_cursor() from exc

    if not isinstance(payload, dict) or payload.get("v") != 1:
        raise _invalid_cursor()
    return payload


def filter_fingerprint(q: str | None, tag: str | None) -> str:
    normalized = json.dumps(
        {"q": (q or "").strip().lower(), "tag": (tag or "").strip().lower()},
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(normalized).hexdigest()[:24]


def _key() -> bytes:
    return get_settings().effective_cursor_signing_key.encode("utf-8")


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _invalid_cursor() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired notes cursor",
    )
