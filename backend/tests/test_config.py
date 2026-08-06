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
    monkeypatch.setenv("CURSOR_SIGNING_KEY", "x" * 32)
    get_settings.cache_clear()

    settings = Settings()
    assert settings.allowed_origins == ["https://notevault.vercel.app"]
    assert settings.is_production is True

    get_settings.cache_clear()
    for key in ("ENVIRONMENT", "ALLOWED_ORIGINS", "CURSOR_SIGNING_KEY"):
        os.environ.pop(key, None)


def test_production_requires_strong_cursor_key(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://notevault.vercel.app")
    monkeypatch.delenv("CURSOR_SIGNING_KEY", raising=False)

    with pytest.raises(RuntimeError, match="CURSOR_SIGNING_KEY"):
        Settings()


def test_ai_configuration_defaults_and_base_url_normalization(monkeypatch):
    monkeypatch.setenv("SILICONFLOW_API_KEY", "test-provider-secret")
    monkeypatch.setenv("SILICONFLOW_BASE_URL", "https://example.test/v1///")
    monkeypatch.delenv("SILICONFLOW_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("SILICONFLOW_MAX_TOKENS", raising=False)
    monkeypatch.delenv("SILICONFLOW_AI_RATE_LIMIT_PER_MINUTE", raising=False)

    settings = Settings()

    assert settings.siliconflow_base_url == "https://example.test/v1"
    assert settings.siliconflow_model == "deepseek-ai/DeepSeek-V4-Flash"
    assert settings.siliconflow_timeout_seconds == 45
    assert settings.siliconflow_max_tokens == 4096
    assert settings.siliconflow_ai_rate_limit_per_minute == 10
    assert "test-provider-secret" not in repr(settings)


def test_missing_ai_key_does_not_prevent_settings_startup(monkeypatch):
    monkeypatch.delenv("SILICONFLOW_API_KEY", raising=False)

    settings = Settings()

    assert settings.siliconflow_api_key == ""
    assert "<missing>" in repr(settings)


@pytest.mark.parametrize(
    "name,value",
    [
        ("SILICONFLOW_TIMEOUT_SECONDS", "0"),
        ("SILICONFLOW_TIMEOUT_SECONDS", "121"),
        ("SILICONFLOW_TIMEOUT_SECONDS", "not-a-number"),
        ("SILICONFLOW_MAX_TOKENS", "0"),
        ("SILICONFLOW_MAX_TOKENS", "16385"),
        ("SILICONFLOW_MAX_TOKENS", "1.5"),
        ("SILICONFLOW_AI_RATE_LIMIT_PER_MINUTE", "0"),
        ("SILICONFLOW_AI_RATE_LIMIT_PER_MINUTE", "1001"),
    ],
)
def test_invalid_ai_numeric_configuration_is_rejected(monkeypatch, name, value):
    monkeypatch.setenv(name, value)

    with pytest.raises(RuntimeError, match=name):
        Settings()


@pytest.mark.parametrize(
    "value",
    [
        "http://api.example.test/v1",
        "https://api.example.test:invalid/v1",
        "https://user:password@api.example.test/v1",
        "https://api.example.test/v1?",
        "https://api.example.test/v1#",
        "https://%20api.example.test/v1",
    ],
)
def test_ai_base_url_rejects_invalid_or_credentialed_urls(monkeypatch, value):
    monkeypatch.setenv("SILICONFLOW_BASE_URL", value)

    with pytest.raises(RuntimeError, match="HTTPS provider URL"):
        Settings()
