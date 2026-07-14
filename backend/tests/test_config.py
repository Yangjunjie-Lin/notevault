import os

import pytest

from app.config import Settings, get_settings


def test_production_rejects_wildcard_origins(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ALLOWED_ORIGINS", "*")
    get_settings.cache_clear()

    with pytest.raises(RuntimeError, match="Wildcard"):
        Settings()

    get_settings.cache_clear()


def test_reads_lowercase_firebase_credentials_env(monkeypatch):
    monkeypatch.delenv("FIREBASE_CREDENTIALS_JSON", raising=False)
    monkeypatch.setenv("firebase_credentials_json", '{"type":"service_account","project_id":"demo"}')
    get_settings.cache_clear()

    settings = Settings()
    assert settings.firebase_credentials_json == '{"type":"service_account","project_id":"demo"}'

    get_settings.cache_clear()
    os.environ.pop("firebase_credentials_json", None)


def test_production_accepts_explicit_origins(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://notevault.vercel.app")
    get_settings.cache_clear()

    settings = Settings()
    assert settings.allowed_origins == ["https://notevault.vercel.app"]
    assert settings.is_production is True

    get_settings.cache_clear()
    for key in ("ENVIRONMENT", "ALLOWED_ORIGINS"):
        os.environ.pop(key, None)
