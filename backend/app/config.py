from functools import lru_cache
from pathlib import Path
import os
import re
from typing import Callable, TypeVar

from dotenv import load_dotenv
import httpx


BASE_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BASE_DIR.parent

load_dotenv(ROOT_DIR / ".env")
load_dotenv(BASE_DIR / ".env")

LOCAL_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

T = TypeVar("T", int, float)
PROVIDER_HOSTNAME = re.compile(
    r"(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
)


def _bounded_number(
    env_name: str,
    default: str,
    converter: Callable[[str], T],
    *,
    minimum: T,
    maximum: T,
) -> T:
    raw_value = os.getenv(env_name, default).strip()
    try:
        value = converter(raw_value)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(
            f"{env_name} must be a number between {minimum} and {maximum}."
        ) from exc

    if not minimum <= value <= maximum:
        raise RuntimeError(
            f"{env_name} must be between {minimum} and {maximum}."
        )
    return value


class Settings:
    def __init__(self) -> None:
        self.app_name = os.getenv("APP_NAME", "NoteVault API")
        self.version = os.getenv("APP_VERSION", "1.2.0")
        self.environment = os.getenv("ENVIRONMENT", "development").strip().lower()
        self.allowed_origins = self._resolve_origins(
            os.getenv(
                "ALLOWED_ORIGINS",
                ",".join(LOCAL_DEV_ORIGINS),
            )
        )
        # Vercel UI may normalize env keys to lowercase; accept both spellings.
        self.firebase_credentials_json = os.getenv("FIREBASE_CREDENTIALS_JSON") or os.getenv(
            "firebase_credentials_json"
        )
        self.firebase_credentials_path = os.getenv("FIREBASE_CREDENTIALS_PATH") or os.getenv(
            "firebase_credentials_path"
        )
        self.cursor_signing_key = os.getenv("CURSOR_SIGNING_KEY", "").strip()
        self.siliconflow_api_key = os.getenv("SILICONFLOW_API_KEY", "").strip()
        self.siliconflow_base_url = os.getenv(
            "SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1"
        ).strip().rstrip("/")
        self.siliconflow_model = os.getenv(
            "SILICONFLOW_MODEL", "deepseek-ai/DeepSeek-V4-Flash"
        ).strip()
        self.siliconflow_timeout_seconds = _bounded_number(
            "SILICONFLOW_TIMEOUT_SECONDS",
            "45",
            float,
            minimum=1.0,
            maximum=120.0,
        )
        self.siliconflow_max_tokens = _bounded_number(
            "SILICONFLOW_MAX_TOKENS",
            "4096",
            int,
            minimum=1,
            maximum=16384,
        )
        self.siliconflow_ai_rate_limit_per_minute = _bounded_number(
            "SILICONFLOW_AI_RATE_LIMIT_PER_MINUTE",
            "10",
            int,
            minimum=1,
            maximum=1000,
        )

        try:
            base_url = httpx.URL(self.siliconflow_base_url)
            # Accessing port forces HTTPX to validate an explicitly supplied port.
            _ = base_url.port
        except (httpx.InvalidURL, ValueError) as exc:
            raise RuntimeError(
                "SILICONFLOW_BASE_URL must be a valid HTTPS provider URL."
            ) from exc
        hostname = base_url.host or ""
        if (
            base_url.scheme != "https"
            or not PROVIDER_HOSTNAME.fullmatch(hostname)
            or base_url.username
            or base_url.password
            or "?" in self.siliconflow_base_url
            or "#" in self.siliconflow_base_url
        ):
            raise RuntimeError(
                "SILICONFLOW_BASE_URL must be a valid HTTPS provider URL without "
                "credentials, a query, or a fragment."
            )
        if not self.siliconflow_model:
            raise RuntimeError("SILICONFLOW_MODEL must not be empty.")

        if self.is_production and len(self.cursor_signing_key) < 32:
            raise RuntimeError(
                "Production deployments require CURSOR_SIGNING_KEY with at least 32 characters."
            )

    @property
    def is_production(self) -> bool:
        return self.environment in {"production", "prod"}

    def _resolve_origins(self, value: str) -> list[str]:
        origins = self._split_origins(value)

        if self.is_production and ("*" in origins or not origins):
            raise RuntimeError(
                "Production deployments require an explicit ALLOWED_ORIGINS list. "
                "Wildcard (*) origins are not allowed when ENVIRONMENT=production."
            )

        return origins or list(LOCAL_DEV_ORIGINS)

    @staticmethod
    def _split_origins(value: str) -> list[str]:
        return [origin.strip() for origin in value.split(",") if origin.strip()]

    @property
    def effective_cursor_signing_key(self) -> str:
        if self.cursor_signing_key:
            return self.cursor_signing_key
        return "notevault-local-development-cursor-key"

    def __repr__(self) -> str:
        """Keep deployment secrets out of diagnostics and tracebacks."""
        return (
            "Settings("
            f"app_name={self.app_name!r}, "
            f"version={self.version!r}, "
            f"environment={self.environment!r}, "
            f"siliconflow_api_key={'<configured>' if self.siliconflow_api_key else '<missing>'!r}"
            ")"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
