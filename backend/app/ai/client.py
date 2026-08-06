"""Minimal asynchronous SiliconFlow Chat Completions client."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
import logging
from math import ceil
from time import monotonic
from typing import Any, Callable

import httpx

from ..config import Settings


logger = logging.getLogger(__name__)
MAX_RETRIES = 2
RETRYABLE_STATUS_CODES = {429, 503, 504}
TRACE_HEADER = "x-siliconcloud-trace-id"


@dataclass(frozen=True)
class Completion:
    content: str
    trace_id: str | None


class AiProviderError(Exception):
    """A sanitized error that is safe to map into the public API contract."""

    def __init__(
        self,
        status_code: int,
        detail: str,
        *,
        category: str,
        trace_id: str | None = None,
        retry_after: int | None = None,
    ) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.category = category
        self.trace_id = trace_id
        self.retry_after = retry_after


class SiliconFlowClient:
    def __init__(
        self,
        settings: Settings,
        *,
        client_factory: Callable[..., httpx.AsyncClient] = httpx.AsyncClient,
        sleep: Callable[[float], Any] = asyncio.sleep,
    ) -> None:
        self._settings = settings
        self._client_factory = client_factory
        self._sleep = sleep

    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        request_type: str,
    ) -> Completion:
        timeout_seconds = self._settings.siliconflow_timeout_seconds
        deadline = monotonic() + timeout_seconds
        timeout = httpx.Timeout(
            timeout_seconds,
            connect=min(10.0, timeout_seconds),
            read=timeout_seconds,
            write=min(10.0, timeout_seconds),
            pool=min(5.0, timeout_seconds),
        )
        headers = {
            "Authorization": f"Bearer {self._settings.siliconflow_api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self._settings.siliconflow_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "max_tokens": self._settings.siliconflow_max_tokens,
            "temperature": temperature,
            "n": 1,
        }

        async with self._client_factory(timeout=timeout) as client:
            for attempt in range(MAX_RETRIES + 1):
                started_at = monotonic()
                remaining = deadline - started_at
                if remaining <= 0:
                    raise AiProviderError(
                        504,
                        "AI request timed out",
                        category="timeout",
                    )
                attempt_timeout = httpx.Timeout(
                    remaining,
                    connect=min(10.0, remaining),
                    read=remaining,
                    write=min(10.0, remaining),
                    pool=min(5.0, remaining),
                )
                try:
                    response = await asyncio.wait_for(
                        client.post(
                            f"{self._settings.siliconflow_base_url}/chat/completions",
                            headers=headers,
                            json=body,
                            timeout=attempt_timeout,
                        ),
                        timeout=remaining,
                    )
                except (httpx.ConnectTimeout, httpx.ReadTimeout) as exc:
                    delay = _backoff_seconds(attempt)
                    if attempt < MAX_RETRIES and monotonic() + delay < deadline:
                        await self._sleep(delay)
                        continue
                    self._log_failure(
                        request_type=request_type,
                        category="timeout",
                        status_code=504,
                        trace_id=None,
                        started_at=started_at,
                    )
                    raise AiProviderError(
                        504,
                        "AI request timed out",
                        category="timeout",
                    ) from exc
                except (asyncio.TimeoutError, httpx.WriteTimeout, httpx.PoolTimeout) as exc:
                    self._log_failure(
                        request_type=request_type,
                        category="timeout",
                        status_code=504,
                        trace_id=None,
                        started_at=started_at,
                    )
                    raise AiProviderError(
                        504,
                        "AI request timed out",
                        category="timeout",
                    ) from exc
                except (httpx.ConnectError, httpx.ReadError) as exc:
                    delay = _backoff_seconds(attempt)
                    if attempt < MAX_RETRIES and monotonic() + delay < deadline:
                        await self._sleep(delay)
                        continue
                    self._log_failure(
                        request_type=request_type,
                        category="network",
                        status_code=503,
                        trace_id=None,
                        started_at=started_at,
                    )
                    raise AiProviderError(
                        503,
                        "AI service is temporarily unavailable",
                        category="network",
                    ) from exc
                except httpx.InvalidURL as exc:
                    self._log_failure(
                        request_type=request_type,
                        category="configuration",
                        status_code=503,
                        trace_id=None,
                        started_at=started_at,
                    )
                    raise AiProviderError(
                        503,
                        "AI service configuration error",
                        category="configuration",
                    ) from exc
                except httpx.RequestError as exc:
                    self._log_failure(
                        request_type=request_type,
                        category="network",
                        status_code=503,
                        trace_id=None,
                        started_at=started_at,
                    )
                    raise AiProviderError(
                        503,
                        "AI service is temporarily unavailable",
                        category="network",
                    ) from exc

                trace_id = _safe_trace_id(response.headers.get(TRACE_HEADER))
                if response.status_code in RETRYABLE_STATUS_CODES and attempt < MAX_RETRIES:
                    delay = _retry_delay(response, attempt)
                    if monotonic() + delay < deadline:
                        await self._sleep(delay)
                        continue
                if not 200 <= response.status_code < 300:
                    error = _status_error(response, trace_id)
                    self._log_failure(
                        request_type=request_type,
                        category=error.category,
                        status_code=response.status_code,
                        trace_id=trace_id,
                        started_at=started_at,
                    )
                    raise error

                completion = _parse_completion(response, trace_id)
                logger.info(
                    "AI provider request completed type=%s status=%s latency_ms=%s trace_id=%s",
                    request_type,
                    response.status_code,
                    round((monotonic() - started_at) * 1000),
                    trace_id or "none",
                )
                return completion

        raise AssertionError("AI provider retry loop exited unexpectedly")

    @staticmethod
    def _log_failure(
        *,
        request_type: str,
        category: str,
        status_code: int,
        trace_id: str | None,
        started_at: float,
    ) -> None:
        logger.warning(
            "AI provider request failed type=%s category=%s status=%s latency_ms=%s trace_id=%s",
            request_type,
            category,
            status_code,
            round((monotonic() - started_at) * 1000),
            trace_id or "none",
        )


def _parse_completion(response: httpx.Response, trace_id: str | None) -> Completion:
    try:
        data = response.json()
    except (ValueError, TypeError) as exc:
        raise AiProviderError(
            502,
            "AI provider returned an invalid response",
            category="invalid_response",
            trace_id=trace_id,
        ) from exc

    choices = data.get("choices") if isinstance(data, dict) else None
    if not isinstance(choices, list) or not choices:
        raise AiProviderError(
            502,
            "AI provider returned an invalid response",
            category="invalid_response",
            trace_id=trace_id,
        )
    first_choice = choices[0]
    finish_reason = (
        first_choice.get("finish_reason") if isinstance(first_choice, dict) else None
    )
    if finish_reason != "stop":
        raise AiProviderError(
            502,
            "AI provider returned an invalid response",
            category="incomplete_response",
            trace_id=trace_id,
        )
    message = first_choice.get("message") if isinstance(first_choice, dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise AiProviderError(
            502,
            "AI provider returned an invalid response",
            category="invalid_response",
            trace_id=trace_id,
        )
    return Completion(content=content, trace_id=trace_id)


def _status_error(response: httpx.Response, trace_id: str | None) -> AiProviderError:
    status_code = response.status_code
    retry_after = _parse_retry_after(response.headers.get("Retry-After"))
    if status_code in {400, 422}:
        return AiProviderError(
            502,
            "AI provider rejected the request",
            category="rejected",
            trace_id=trace_id,
        )
    if status_code in {401, 403}:
        return AiProviderError(
            503,
            "AI service configuration error",
            category="configuration",
            trace_id=trace_id,
        )
    if status_code == 404:
        return AiProviderError(
            503,
            "Configured AI model is unavailable",
            category="model_unavailable",
            trace_id=trace_id,
        )
    if status_code == 429:
        return AiProviderError(
            429,
            "AI service rate limit reached",
            category="provider_rate_limit",
            trace_id=trace_id,
            retry_after=retry_after if retry_after is not None else 60,
        )
    if status_code in {503, 504}:
        return AiProviderError(
            503,
            "AI service is temporarily unavailable",
            category="provider_unavailable",
            trace_id=trace_id,
        )
    return AiProviderError(
        502,
        "AI provider request failed",
        category="provider_error",
        trace_id=trace_id,
    )


def _retry_delay(response: httpx.Response, attempt: int) -> float:
    retry_after = _parse_retry_after(response.headers.get("Retry-After"))
    if retry_after is not None:
        return float(min(retry_after, 5))
    return _backoff_seconds(attempt)


def _backoff_seconds(attempt: int) -> float:
    return min(0.25 * (2**attempt), 2.0)


def _parse_retry_after(value: str | None) -> int | None:
    if not value:
        return None
    try:
        seconds = int(value)
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(value)
            now = parsedate_to_datetime(_http_date_now())
            seconds = ceil((retry_at - now).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return None
    return max(0, min(seconds, 300))


def _http_date_now() -> str:
    # Kept separate so date-form Retry-After parsing can be deterministically tested.
    from email.utils import formatdate

    return formatdate(usegmt=True)


def _safe_trace_id(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip()
    if not value or len(value) > 128:
        return None
    if any(ord(char) < 32 or ord(char) > 126 for char in value):
        return None
    return value
