import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .routers import ai, health, notes


logging.basicConfig(level=logging.INFO)
settings = get_settings()
SAFE_VALIDATION_LOCATIONS = {
    "body",
    "query",
    "path",
    "header",
    "cookie",
    "text",
    "tags",
    "instruction",
    "limit",
    "cursor",
    "q",
    "tag",
    "note_id",
}

# Wildcard origins cannot be combined with credentialed browser requests.
# Keep that configuration available only for non-production local experiments.
allow_all_origins = "*" in settings.allowed_origins and not settings.is_production
cors_origins = ["*"] if allow_all_origins else settings.allowed_origins

app = FastAPI(title=settings.app_name, version=settings.version)


@app.exception_handler(RequestValidationError)
async def sanitized_validation_error(
    _request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Keep rejected note text and secret-shaped extra fields out of 422 bodies."""
    details: list[dict[str, Any]] = []
    for error in exc.errors():
        safe_location = tuple(
            part
            if isinstance(part, int) or part in SAFE_VALIDATION_LOCATIONS
            else "field"
            for part in error.get("loc", ())
        )
        details.append(
            {
                "type": error.get("type", "value_error"),
                "loc": safe_location,
                "msg": error.get("msg", "Invalid request value"),
            }
        )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": details},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(notes.router)
app.include_router(ai.router)
