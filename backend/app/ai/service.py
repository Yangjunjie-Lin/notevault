"""Application-level AI operations and output validation."""

from __future__ import annotations

import json
import re

from fastapi import Depends, HTTPException, status
from pydantic import ValidationError

from ..config import Settings, get_settings
from ..schemas import AiFormatResponse, AiRevisionResponse, AiSuggestionEnvelope
from .client import AiProviderError, Completion, SiliconFlowClient
from .prompts import (
    CAPTURE_SYSTEM_PROMPT,
    CONVERSATION_SYSTEM_PROMPT,
    FORMATTER_SYSTEM_PROMPT,
    REVISION_SYSTEM_PROMPT,
    capture_user_prompt,
    conversation_user_prompt,
    formatter_user_prompt,
    revision_user_prompt,
)


MAX_NOTE_LENGTH = 5000
OUTER_MARKDOWN_FENCE = re.compile(
    r"\A(?P<fence>`{3,}|~{3,})(?:markdown|md)?[ \t]*\r?\n"
    r"(?P<content>[\s\S]*?)\r?\n(?P=fence)[ \t]*\Z",
    re.IGNORECASE,
)
OUTER_JSON_FENCE = re.compile(
    r"\A`{3,}(?:json)?[ \t]*\r?\n(?P<content>[\s\S]*?)\r?\n`{3,}[ \t]*\Z",
    re.IGNORECASE,
)


class AiService:
    def __init__(
        self,
        settings: Settings,
        *,
        client: SiliconFlowClient | None = None,
    ) -> None:
        self._settings = settings
        self._client = client or SiliconFlowClient(settings)

    @property
    def model_name(self) -> str:
        return self._settings.siliconflow_model

    async def format_markdown(self, text: str) -> AiFormatResponse:
        self._require_configuration()
        try:
            result = await self._client.complete(
                system_prompt=FORMATTER_SYSTEM_PROMPT,
                user_prompt=formatter_user_prompt(text),
                temperature=0.1,
                request_type="format_markdown",
            )
            cleaned = clean_ai_markdown(result.content)
        except AiProviderError as exc:
            raise _provider_http_error(exc) from exc

        return AiFormatResponse(
            text=cleaned,
            changed=cleaned != text,
            model=self._settings.siliconflow_model,
            trace_id=result.trace_id,
        )

    async def revise_note(self, text: str, instruction: str) -> AiRevisionResponse:
        self._require_configuration()
        try:
            result = await self._client.complete(
                system_prompt=REVISION_SYSTEM_PROMPT,
                user_prompt=revision_user_prompt(text, instruction),
                temperature=0.2,
                request_type="revise_note",
            )
            cleaned = clean_ai_markdown(result.content)
        except AiProviderError as exc:
            raise _provider_http_error(exc) from exc

        return AiRevisionResponse(
            text=cleaned,
            model=self._settings.siliconflow_model,
            trace_id=result.trace_id,
        )

    async def chat(
        self,
        history: list[tuple[str, str]],
        text: str,
    ) -> Completion:
        self._require_configuration()
        try:
            result = await self._client.complete(
                system_prompt=CONVERSATION_SYSTEM_PROMPT,
                user_prompt=conversation_user_prompt(history, text),
                temperature=0.35,
                request_type="conversation_reply",
            )
            return Completion(
                content=clean_ai_markdown(result.content),
                trace_id=result.trace_id,
            )
        except AiProviderError as exc:
            raise _provider_http_error(exc) from exc

    async def suggest_captures(
        self,
        transcript: list[tuple[str, str]],
        intent: str,
    ) -> tuple[AiSuggestionEnvelope, str | None]:
        self._require_configuration()
        try:
            result = await self._client.complete(
                system_prompt=CAPTURE_SYSTEM_PROMPT,
                user_prompt=capture_user_prompt(transcript, intent),
                temperature=0.1,
                request_type="conversation_capture",
            )
            return parse_capture_suggestions(result.content), result.trace_id
        except AiProviderError as exc:
            raise _provider_http_error(exc) from exc

    def _require_configuration(self) -> None:
        if not self._settings.siliconflow_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI service is not configured",
            )


def get_ai_service(settings: Settings = Depends(get_settings)) -> AiService:
    return AiService(settings)


def clean_ai_markdown(value: str) -> str:
    if not isinstance(value, str):
        raise AiProviderError(
            502,
            "AI provider returned an invalid response",
            category="invalid_response",
        )
    cleaned = value.strip()
    wrapper = OUTER_MARKDOWN_FENCE.fullmatch(cleaned)
    if wrapper:
        cleaned = wrapper.group("content").strip()
    if not cleaned:
        raise AiProviderError(
            502,
            "AI provider returned an invalid response",
            category="invalid_response",
        )
    if len(cleaned) > MAX_NOTE_LENGTH:
        raise AiProviderError(
            502,
            "AI provider returned content that exceeds the note length limit",
            category="output_too_long",
        )
    return cleaned


def parse_capture_suggestions(value: str) -> AiSuggestionEnvelope:
    if not isinstance(value, str):
        raise AiProviderError(
            502,
            "AI provider returned invalid capture suggestions",
            category="invalid_capture_response",
        )
    cleaned = value.strip()
    wrapper = OUTER_JSON_FENCE.fullmatch(cleaned)
    if wrapper:
        cleaned = wrapper.group("content").strip()
    if not cleaned or len(cleaned) > 24_000:
        raise AiProviderError(
            502,
            "AI provider returned invalid capture suggestions",
            category="invalid_capture_response",
        )
    try:
        payload = json.loads(cleaned)
        return AiSuggestionEnvelope.model_validate(payload)
    except (json.JSONDecodeError, ValidationError, TypeError) as exc:
        raise AiProviderError(
            502,
            "AI provider returned invalid capture suggestions",
            category="invalid_capture_response",
        ) from exc


def _provider_http_error(exc: AiProviderError) -> HTTPException:
    headers = None
    if exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS and exc.retry_after is not None:
        headers = {"Retry-After": str(max(1, exc.retry_after))}
    return HTTPException(
        status_code=exc.status_code,
        detail=exc.detail,
        headers=headers,
    )
