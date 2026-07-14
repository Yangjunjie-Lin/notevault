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
from app.main import app  # noqa: E402
from app.rate_limit import read_notes_limiter, write_notes_limiter  # noqa: E402
from app.routers import notes as notes_router  # noqa: E402


pytestmark = pytest.mark.integration


@pytest.fixture
def emulator_db(monkeypatch):
    if not os.getenv("FIRESTORE_EMULATOR_HOST"):
        pytest.fail("FIRESTORE_EMULATOR_HOST is required for integration tests")

    database = firestore.Client(
        project=os.getenv("GCLOUD_PROJECT", "notevault-test"),
        credentials=AnonymousCredentials(),
    )
    monkeypatch.setattr(notes_router, "get_firestore_client", lambda: database)
    _clear_notes(database)
    yield database
    _clear_notes(database)
    database.close()


@pytest.fixture
def integration_client(emulator_db):
    app.dependency_overrides[get_current_uid] = lambda: "integration-user"
    read_notes_limiter.reset()
    write_notes_limiter.reset()
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
    read_notes_limiter.reset()
    write_notes_limiter.reset()


def _clear_notes(database):
    for snapshot in database.collection("notes").stream():
        snapshot.reference.delete()
