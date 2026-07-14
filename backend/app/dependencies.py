from typing import Optional

from fastapi import Header, HTTPException, status

from .firebase import verify_firebase_token


def get_current_uid(authorization: Optional[str] = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    try:
        decoded = verify_firebase_token(token)
    except HTTPException:
        raise
    except Exception as exc:
        # Initialization/config failures are not end-user token mistakes.
        message = str(exc)
        if (
            "FIREBASE_CREDENTIALS" in message
            or "credentials were not found" in message
            or "service account" in message.lower()
            or "Certificate construction failed" in message
            or "Failed to initialize a certificate credential" in message
        ):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Firebase Admin is not configured correctly on the API",
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Firebase token",
        ) from exc

    uid = decoded.get("uid")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase token does not include a uid",
        )

    return uid

