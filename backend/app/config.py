from functools import lru_cache
from pathlib import Path
import os

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BASE_DIR.parent

load_dotenv(ROOT_DIR / ".env")
load_dotenv(BASE_DIR / ".env")

LOCAL_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


class Settings:
    def __init__(self) -> None:
        self.app_name = os.getenv("APP_NAME", "NoteVault API")
        self.version = os.getenv("APP_VERSION", "1.0.0")
        self.environment = os.getenv("ENVIRONMENT", "development").strip().lower()
        self.allowed_origins = self._resolve_origins(
            os.getenv(
                "ALLOWED_ORIGINS",
                ",".join(LOCAL_DEV_ORIGINS),
            )
        )
        self.firebase_credentials_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
        self.firebase_credentials_path = os.getenv("FIREBASE_CREDENTIALS_PATH")

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
