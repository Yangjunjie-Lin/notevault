import asyncio
import json

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.ai.client import (
    AiProviderError,
    Completion,
    SiliconFlowClient,
)
from app.ai.prompts import FORMATTER_SYSTEM_PROMPT, REVISION_SYSTEM_PROMPT
from app.ai.service import AiService, clean_ai_markdown, get_ai_service
from app.config import Settings, get_settings
from app.dependencies import get_current_uid
from app.main import app
from app.rate_limit import InMemoryRateLimiter, ai_limiter
from app.schemas import AiFormatResponse, AiRevisionResponse


class StubAiService:
    def __init__(self) -> None:
        self.calls = []

    async def format_markdown(self, text: str) -> AiFormatResponse:
        self.calls.append(("format", text))
        return AiFormatResponse(
            text="# Clean note",
            changed=True,
            model="deepseek-ai/DeepSeek-V4-Flash",
            trace_id="trace-123",
        )

    async def revise_note(self, text: str, instruction: str) -> AiRevisionResponse:
        self.calls.append(("revise", text, instruction))
        return AiRevisionResponse(
            text="# Revised note",
            model="deepseek-ai/DeepSeek-V4-Flash",
            trace_id=None,
        )


class StubCompletionClient:
    def __init__(self, content: str, trace_id: str | None = "trace-1") -> None:
        self.content = content
        self.trace_id = trace_id
        self.calls = []

    async def complete(self, **kwargs) -> Completion:
        self.calls.append(kwargs)
        return Completion(content=self.content, trace_id=self.trace_id)


class FailingCompletionClient:
    def __init__(self, error: AiProviderError) -> None:
        self.error = error

    async def complete(self, **_kwargs) -> Completion:
        raise self.error


def _settings(monkeypatch, *, api_key: str = "provider-secret") -> Settings:
    monkeypatch.setenv("SILICONFLOW_API_KEY", api_key)
    monkeypatch.setenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1/")
    monkeypatch.setenv("SILICONFLOW_MODEL", "deepseek-ai/DeepSeek-V4-Flash")
    monkeypatch.setenv("SILICONFLOW_TIMEOUT_SECONDS", "45")
    monkeypatch.setenv("SILICONFLOW_MAX_TOKENS", "4096")
    monkeypatch.setenv("SILICONFLOW_AI_RATE_LIMIT_PER_MINUTE", "10")
    return Settings()


@pytest.fixture
def ai_api_client():
    service = StubAiService()
    app.dependency_overrides[get_current_uid] = lambda: "verified-user"
    app.dependency_overrides[get_ai_service] = lambda: service
    ai_limiter.reset()
    with TestClient(app) as client:
        yield client, service
    app.dependency_overrides.clear()
    ai_limiter.reset()


def test_format_endpoint_uses_verified_uid_dependency(ai_api_client):
    client, service = ai_api_client
    response = client.post("/ai/format-markdown", json={"text": "  # Raw note  "})

    assert response.status_code == 200
    assert response.json() == {
        "text": "# Clean note",
        "changed": True,
        "model": "deepseek-ai/DeepSeek-V4-Flash",
        "traceId": "trace-123",
    }
    assert service.calls == [("format", "# Raw note")]


def test_revision_endpoint_does_not_accept_client_uid(ai_api_client):
    client, service = ai_api_client
    response = client.post(
        "/ai/revise-note",
        json={
            "text": "A note",
            "instruction": "Improve it",
            "uid": "forged-user",
        },
    )

    assert response.status_code == 422
    assert service.calls == []


def test_revision_endpoint_returns_candidate(ai_api_client):
    client, service = ai_api_client
    response = client.post(
        "/ai/revise-note",
        json={"text": "  A note  ", "instruction": "  Improve it  "},
    )

    assert response.status_code == 200
    assert response.json() == {
        "text": "# Revised note",
        "model": "deepseek-ai/DeepSeek-V4-Flash",
        "traceId": None,
    }
    assert service.calls == [("revise", "A note", "Improve it")]


def test_openapi_exposes_strict_ai_contracts():
    schema = app.openapi()
    paths = schema["paths"]
    components = schema["components"]["schemas"]

    assert paths["/ai/format-markdown"]["post"]["requestBody"]["content"][
        "application/json"
    ]["schema"] == {"$ref": "#/components/schemas/AiTextRequest"}
    assert paths["/ai/revise-note"]["post"]["requestBody"]["content"][
        "application/json"
    ]["schema"] == {"$ref": "#/components/schemas/AiRevisionRequest"}
    assert components["AiTextRequest"]["additionalProperties"] is False
    assert components["AiTextRequest"]["properties"]["text"]["maxLength"] == 5000
    assert components["AiRevisionRequest"]["additionalProperties"] is False
    assert components["AiRevisionRequest"]["properties"]["instruction"][
        "maxLength"
    ] == 1000
    assert "traceId" in components["AiFormatResponse"]["properties"]


def test_ai_endpoint_without_authentication_returns_401():
    app.dependency_overrides.clear()
    ai_limiter.reset()
    with TestClient(app) as client:
        response = client.post("/ai/format-markdown", json={"text": "A note"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token"


def test_openapi_declares_bearer_auth_and_stable_ai_errors():
    schema = app.openapi()

    bearer = schema["components"]["securitySchemes"]["FirebaseBearer"]
    assert bearer["type"] == "http"
    assert bearer["scheme"] == "bearer"
    for path in ("/ai/format-markdown", "/ai/revise-note"):
        operation = schema["paths"][path]["post"]
        assert operation["security"] == [{"FirebaseBearer": []}]
        assert {"401", "422", "429", "502", "503", "504"}.issubset(
            operation["responses"]
        )
        retry_after = operation["responses"]["429"]["headers"]["Retry-After"]
        assert retry_after["schema"]["minimum"] == 1


@pytest.mark.parametrize(
    "path,payload",
    [
        ("/ai/format-markdown", {"text": ""}),
        ("/ai/format-markdown", {"text": "   \n\t"}),
        ("/ai/format-markdown", {"text": "x" * 5001}),
        ("/ai/revise-note", {"text": "note", "instruction": ""}),
        ("/ai/revise-note", {"text": "note", "instruction": " \n "}),
        ("/ai/revise-note", {"text": "note", "instruction": "x" * 1001}),
        ("/ai/format-markdown", {"text": "note", "model": "attacker/model"}),
        ("/ai/format-markdown", {"text": "note", "apiKey": "secret"}),
        ("/ai/format-markdown", {"text": "note", "tags": ["private"]}),
        ("/ai/format-markdown", {"text": "note", "temperature": 1}),
    ],
)
def test_ai_request_validation_rejects_invalid_and_extra_fields(
    ai_api_client, path, payload
):
    client, service = ai_api_client
    response = client.post(path, json=payload)

    assert response.status_code == 422
    assert service.calls == []


def test_validation_errors_do_not_echo_note_or_secret_shaped_fields(ai_api_client):
    client, service = ai_api_client
    private_marker = "private-note-marker-" + ("x" * 5000)
    secret_marker = "provider-secret-marker"

    oversized = client.post("/ai/format-markdown", json={"text": private_marker})
    forged = client.post(
        "/ai/format-markdown",
        json={"text": "note", secret_marker: secret_marker},
    )

    assert oversized.status_code == 422
    assert forged.status_code == 422
    assert "private-note-marker" not in oversized.text
    assert secret_marker not in forged.text
    assert service.calls == []


def test_missing_api_key_is_controlled_503(monkeypatch):
    settings = _settings(monkeypatch, api_key="")
    service = AiService(settings, client=StubCompletionClient("unused"))
    app.dependency_overrides[get_current_uid] = lambda: "verified-user"
    app.dependency_overrides[get_ai_service] = lambda: service
    ai_limiter.reset()

    with TestClient(app) as client:
        response = client.post("/ai/format-markdown", json={"text": "A note"})

    app.dependency_overrides.clear()
    assert response.status_code == 503
    assert response.json() == {"detail": "AI service is not configured"}


def test_ai_rate_limiter_is_independent_per_uid():
    limiter = InMemoryRateLimiter(max_requests=1, window_seconds=60)
    limiter.check("user-a")
    limiter.check("user-b")

    with pytest.raises(HTTPException) as exc_info:
        limiter.check("user-a")

    assert exc_info.value.status_code == 429
    assert int(exc_info.value.headers["Retry-After"]) > 0
    limiter.reset()
    limiter.check("user-a")


def test_ai_endpoint_rate_limit_returns_retry_after(monkeypatch):
    settings = _settings(monkeypatch)
    settings.siliconflow_ai_rate_limit_per_minute = 1
    service = StubAiService()
    app.dependency_overrides[get_current_uid] = lambda: "rate-limited-user"
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_ai_service] = lambda: service
    ai_limiter.reset()

    with TestClient(app) as client:
        first = client.post("/ai/format-markdown", json={"text": "A note"})
        second = client.post(
            "/ai/revise-note",
            json={
                "text": "A note",
                "instruction": "Improve it",
            },
        )

    app.dependency_overrides.clear()
    ai_limiter.reset()
    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["detail"] == "AI request rate limit exceeded. Please try again later."
    assert int(second.headers["Retry-After"]) > 0
    assert service.calls == [("format", "A note")]


def test_service_formatter_and_revision_use_separate_controlled_prompts(monkeypatch):
    settings = _settings(monkeypatch)
    client = StubCompletionClient(" # Result \n")
    service = AiService(settings, client=client)

    formatted = asyncio.run(service.format_markdown("# Original"))
    revised = asyncio.run(service.revise_note("# Original", "Make it concise"))

    assert formatted.text == "# Result"
    assert formatted.changed is True
    assert revised.text == "# Result"
    format_call, revision_call = client.calls
    assert format_call["system_prompt"] == FORMATTER_SYSTEM_PROMPT
    assert format_call["temperature"] == 0.1
    assert "<note>\n# Original\n</note>" in format_call["user_prompt"]
    assert revision_call["system_prompt"] == REVISION_SYSTEM_PROMPT
    assert revision_call["temperature"] == 0.2
    assert "<instruction>\nMake it concise\n</instruction>" in revision_call["user_prompt"]
    assert "<note>\n# Original\n</note>" in revision_call["user_prompt"]


def test_formatter_changed_false_for_identical_output(monkeypatch):
    settings = _settings(monkeypatch)
    service = AiService(settings, client=StubCompletionClient("A note"))

    result = asyncio.run(service.format_markdown("A note"))

    assert result.changed is False


def test_service_maps_provider_error_to_sanitized_http_contract(monkeypatch):
    settings = _settings(monkeypatch)
    provider_error = AiProviderError(
        429,
        "AI service rate limit reached",
        category="provider_rate_limit",
        retry_after=7,
    )
    service = AiService(settings, client=FailingCompletionClient(provider_error))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(service.revise_note("A note", "Improve it"))

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail == "AI service rate limit reached"
    assert exc_info.value.headers == {"Retry-After": "7"}


def test_service_rejects_oversized_provider_output_without_truncating(monkeypatch):
    settings = _settings(monkeypatch)
    service = AiService(settings, client=StubCompletionClient("x" * 5001))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(service.format_markdown("A note"))

    assert exc_info.value.status_code == 502
    assert "length limit" in exc_info.value.detail


def test_output_cleanup_removes_only_an_outer_markdown_fence():
    wrapped = "```markdown\n# Note\n\n```python\nprint('ok')\n```\n```"
    assert clean_ai_markdown(wrapped) == "# Note\n\n```python\nprint('ok')\n```"

    ordinary = "# Note\n\n```python\nprint('ok')\n```"
    assert clean_ai_markdown(ordinary) == ordinary
    assert clean_ai_markdown("~~~md\n# Note\n~~~") == "# Note"


@pytest.mark.parametrize("content", ["", "  \n ", "x" * 5001])
def test_output_cleanup_rejects_empty_or_oversized_results(content):
    with pytest.raises(AiProviderError) as exc_info:
        clean_ai_markdown(content)

    assert exc_info.value.status_code == 502


def test_output_cleanup_rejects_non_string_results():
    with pytest.raises(AiProviderError) as exc_info:
        clean_ai_markdown(None)

    assert exc_info.value.detail == "AI provider returned an invalid response"


def test_siliconflow_request_contract_and_secret_boundary(monkeypatch):
    settings = _settings(monkeypatch)
    captured = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(
            200,
            headers={"x-siliconcloud-trace-id": "trace-safe"},
            json={
                "choices": [
                    {"finish_reason": "stop", "message": {"content": "# Clean"}}
                ]
            },
        )

    client = SiliconFlowClient(
        settings,
        client_factory=_mock_client_factory(handler),
    )
    result = asyncio.run(
        client.complete(
            system_prompt=FORMATTER_SYSTEM_PROMPT,
            user_prompt="<note>raw</note>",
            temperature=0.1,
            request_type="format_markdown",
        )
    )

    assert result == Completion("# Clean", "trace-safe")
    assert len(captured) == 1
    request = captured[0]
    assert str(request.url) == "https://api.siliconflow.cn/v1/chat/completions"
    assert request.headers["Authorization"] == "Bearer provider-secret"
    assert request.headers["Content-Type"].startswith("application/json")
    assert "firebase" not in request.headers
    body = json.loads(request.content)
    assert body == {
        "model": "deepseek-ai/DeepSeek-V4-Flash",
        "messages": [
            {"role": "system", "content": FORMATTER_SYSTEM_PROMPT},
            {"role": "user", "content": "<note>raw</note>"},
        ],
        "stream": False,
        "max_tokens": 4096,
        "temperature": 0.1,
        "n": 1,
    }


@pytest.mark.parametrize(
    "provider_status,expected_status,expected_detail",
    [
        (400, 502, "AI provider rejected the request"),
        (422, 502, "AI provider rejected the request"),
        (401, 503, "AI service configuration error"),
        (403, 503, "AI service configuration error"),
        (404, 503, "Configured AI model is unavailable"),
        (429, 429, "AI service rate limit reached"),
        (503, 503, "AI service is temporarily unavailable"),
        (504, 503, "AI service is temporarily unavailable"),
        (500, 502, "AI provider request failed"),
    ],
)
def test_provider_status_mapping(
    monkeypatch, provider_status, expected_status, expected_detail
):
    settings = _settings(monkeypatch)
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            provider_status,
            headers={"Retry-After": "2", "x-siliconcloud-trace-id": "trace-err"},
            json={"error": {"message": "raw upstream secret detail"}},
        )

    client = SiliconFlowClient(
        settings,
        client_factory=_mock_client_factory(handler),
        sleep=_no_sleep,
    )

    with pytest.raises(AiProviderError) as exc_info:
        asyncio.run(_complete(client))

    error = exc_info.value
    assert error.status_code == expected_status
    assert error.detail == expected_detail
    assert "raw upstream" not in str(error)
    assert calls == (3 if provider_status in {429, 503, 504} else 1)
    if provider_status == 429:
        assert error.retry_after == 2


def test_retry_after_is_respected_with_a_bounded_delay(monkeypatch):
    settings = _settings(monkeypatch)
    calls = 0
    delays = []

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(429, headers={"Retry-After": "30"})
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"finish_reason": "stop", "message": {"content": "# Clean"}}
                ]
            },
        )

    async def record_sleep(seconds: float) -> None:
        delays.append(seconds)

    client = SiliconFlowClient(
        settings,
        client_factory=_mock_client_factory(handler),
        sleep=record_sleep,
    )

    result = asyncio.run(_complete(client))

    assert result.content == "# Clean"
    assert calls == 2
    assert delays == [5.0]


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, content=b"{not-json"),
        httpx.Response(200, json={}),
        httpx.Response(200, json={"choices": []}),
        httpx.Response(200, json={"choices": [{}]}),
        httpx.Response(
            200,
            json={
                "choices": [{"finish_reason": "stop", "message": {"content": ""}}]
            },
        ),
        httpx.Response(
            200,
            json={
                "choices": [{"finish_reason": "stop", "message": {"content": 42}}]
            },
        ),
        httpx.Response(
            200,
            json={
                "choices": [
                    {"finish_reason": "length", "message": {"content": "truncated"}}
                ]
            },
        ),
        httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "content_filter",
                        "message": {"content": "partial"},
                    }
                ]
            },
        ),
    ],
)
def test_malformed_provider_responses_are_rejected(monkeypatch, response):
    settings = _settings(monkeypatch)
    client = SiliconFlowClient(
        settings,
        client_factory=_mock_client_factory(lambda _request: response),
    )

    with pytest.raises(AiProviderError) as exc_info:
        asyncio.run(_complete(client))

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "AI provider returned an invalid response"


@pytest.mark.parametrize("error_type", [httpx.ConnectTimeout, httpx.ReadTimeout])
def test_provider_timeouts_have_finite_retries(monkeypatch, error_type):
    settings = _settings(monkeypatch)
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise error_type("timed out", request=request)

    client = SiliconFlowClient(
        settings,
        client_factory=_mock_client_factory(handler),
        sleep=_no_sleep,
    )

    with pytest.raises(AiProviderError) as exc_info:
        asyncio.run(_complete(client))

    assert exc_info.value.status_code == 504
    assert exc_info.value.detail == "AI request timed out"
    assert calls == 3


def test_provider_request_has_one_overall_timeout_budget(monkeypatch):
    settings = _settings(monkeypatch)
    settings.siliconflow_timeout_seconds = 0.01
    calls = 0

    async def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.05)
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"finish_reason": "stop", "message": {"content": "# Late"}}
                ]
            },
        )

    client = SiliconFlowClient(
        settings,
        client_factory=_mock_client_factory(handler),
        sleep=_no_sleep,
    )

    with pytest.raises(AiProviderError) as exc_info:
        asyncio.run(_complete(client))

    assert exc_info.value.status_code == 504
    assert exc_info.value.detail == "AI request timed out"
    assert calls == 1


def test_invalid_provider_url_is_sanitized_without_retry(monkeypatch):
    settings = _settings(monkeypatch)
    settings.siliconflow_base_url = "https://example.test:invalid/v1"
    client = SiliconFlowClient(settings, sleep=_no_sleep)

    with pytest.raises(AiProviderError) as exc_info:
        asyncio.run(_complete(client))

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "AI service configuration error"


def test_provider_network_error_has_finite_retries(monkeypatch):
    settings = _settings(monkeypatch)
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ConnectError("offline", request=request)

    client = SiliconFlowClient(
        settings,
        client_factory=_mock_client_factory(handler),
        sleep=_no_sleep,
    )

    with pytest.raises(AiProviderError) as exc_info:
        asyncio.run(_complete(client))

    assert exc_info.value.status_code == 503
    assert calls == 3


def _mock_client_factory(handler):
    transport = httpx.MockTransport(handler)

    def factory(**kwargs):
        return httpx.AsyncClient(transport=transport, **kwargs)

    return factory


async def _no_sleep(_seconds: float) -> None:
    return None


async def _complete(client: SiliconFlowClient):
    return await client.complete(
        system_prompt="system",
        user_prompt="user",
        temperature=0.1,
        request_type="test",
    )
