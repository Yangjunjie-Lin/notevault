import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore


BACKEND_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_DIR))

from app.dependencies import get_current_uid  # noqa: E402
from app.ai.client import Completion  # noqa: E402
from app.ai.service import get_ai_service  # noqa: E402
from app.main import app  # noqa: E402
from app.rate_limit import ai_limiter, read_notes_limiter, write_notes_limiter  # noqa: E402
from app.routers import checkpoints as checkpoints_router  # noqa: E402
from app.routers import conversations as conversations_router  # noqa: E402
from app.routers import notes as notes_router  # noqa: E402


pytestmark = pytest.mark.integration


class IntegrationAiService:
    model_name = "integration-model"

    async def chat(self, history, text):
        prefix = "branch" if history else "root"
        return Completion(content=f"Integration {prefix} reply: {text}", trace_id="integration")


@pytest.fixture
def emulator_db(monkeypatch):
    if not os.getenv("FIRESTORE_EMULATOR_HOST"):
        pytest.fail("FIRESTORE_EMULATOR_HOST is required for integration tests")

    database = firestore.Client(
        project=os.getenv("GCLOUD_PROJECT", "notevault-test"),
        credentials=AnonymousCredentials(),
    )
    monkeypatch.setattr(notes_router, "get_firestore_client", lambda: database)
    monkeypatch.setattr(conversations_router, "get_firestore_client", lambda: database)
    monkeypatch.setattr(checkpoints_router, "get_firestore_client", lambda: database)
    _clear_test_collections(database)
    yield database
    _clear_test_collections(database)
    database.close()


@pytest.fixture
def integration_client(emulator_db):
    app.dependency_overrides[get_current_uid] = lambda: "integration-user"
    app.dependency_overrides[get_ai_service] = lambda: IntegrationAiService()
    read_notes_limiter.reset()
    write_notes_limiter.reset()
    ai_limiter.reset()
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
    read_notes_limiter.reset()
    write_notes_limiter.reset()
    ai_limiter.reset()


def _clear_test_collections(database):
    for name in (
        "capture_batches",
        "checkpoints",
        "conversation_messages",
        "conversations",
        "notes",
    ):
        for snapshot in database.collection(name).stream():
            snapshot.reference.delete()
