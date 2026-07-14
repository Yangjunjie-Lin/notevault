"""Test-only FastAPI process used by Playwright.

This module is never imported by the production entrypoint. It overrides auth
and Firestore only inside the dedicated E2E server process.
"""

from app.dependencies import get_current_uid
from app.main import app
from app.rate_limit import read_notes_limiter, write_notes_limiter
from app.routers import notes as notes_router
from tests.conftest import FakeFirestore


database = FakeFirestore()
read_notes_limiter.reset()
write_notes_limiter.reset()
app.dependency_overrides[get_current_uid] = lambda: "e2e-user"
notes_router.get_firestore_client = lambda: database
