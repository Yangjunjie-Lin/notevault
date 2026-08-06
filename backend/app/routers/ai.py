"""Authenticated NoteVault AI endpoints."""

from fastapi import APIRouter, Depends

from ..ai.service import AiService, get_ai_service
from ..rate_limit import ai_limited_uid
from ..schemas import (
    AiFormatResponse,
    AiRevisionRequest,
    AiRevisionResponse,
    AiTextRequest,
    ErrorResponse,
)


AI_ERROR_RESPONSES = {
    401: {
        "model": ErrorResponse,
        "description": "Firebase authentication is missing or invalid.",
    },
    429: {
        "model": ErrorResponse,
        "description": "The local or provider AI request budget was exceeded.",
        "headers": {
            "Retry-After": {
                "description": "Seconds before another AI request should be attempted.",
                "schema": {"type": "integer", "minimum": 1},
            }
        },
    },
    502: {
        "model": ErrorResponse,
        "description": "The AI provider rejected the request or returned invalid output.",
    },
    503: {
        "model": ErrorResponse,
        "description": "The AI integration is not configured or is temporarily unavailable.",
    },
    504: {
        "model": ErrorResponse,
        "description": "The complete AI operation exceeded its timeout budget.",
    },
}


router = APIRouter(prefix="/ai", tags=["ai"], responses=AI_ERROR_RESPONSES)


@router.post("/format-markdown", response_model=AiFormatResponse)
async def format_markdown(
    payload: AiTextRequest,
    _uid: str = Depends(ai_limited_uid),
    service: AiService = Depends(get_ai_service),
) -> AiFormatResponse:
    return await service.format_markdown(payload.text)


@router.post("/revise-note", response_model=AiRevisionResponse)
async def revise_note(
    payload: AiRevisionRequest,
    _uid: str = Depends(ai_limited_uid),
    service: AiService = Depends(get_ai_service),
) -> AiRevisionResponse:
    return await service.revise_note(payload.text, payload.instruction)
