import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import health, notes


logging.basicConfig(level=logging.INFO)
settings = get_settings()

# Wildcard origins cannot be combined with credentialed browser requests.
# Keep that configuration available only for non-production local experiments.
allow_all_origins = "*" in settings.allowed_origins and not settings.is_production
cors_origins = ["*"] if allow_all_origins else settings.allowed_origins

app = FastAPI(title=settings.app_name, version=settings.version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(notes.router)

