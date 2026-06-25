from functools import lru_cache
from pathlib import Path
import os

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BASE_DIR.parent

load_dotenv(ROOT_DIR / ".env")
load_dotenv(BASE_DIR / ".env")


class Settings:
    app_name = "Personal Notebook API"
    version = "1.0.0"

    def __init__(self) -> None:
        self.allowed_origins = self._split_origins(
            os.getenv(
                "ALLOWED_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173",
            )
        )
        self.firebase_credentials_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
        self.firebase_credentials_path = os.getenv("FIREBASE_CREDENTIALS_PATH")

    @staticmethod
    def _split_origins(value: str) -> list[str]:
        origins = [origin.strip() for origin in value.split(",") if origin.strip()]
        return origins or ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()

