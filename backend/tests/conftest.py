import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.dependencies import get_current_uid  # noqa: E402
from app.main import app  # noqa: E402
from app.rate_limit import read_notes_limiter, write_notes_limiter  # noqa: E402
from app.routers import notes as notes_router  # noqa: E402


class FakeSnapshot:
    def __init__(self, collection, doc_id, data):
        self._collection = collection
        self.id = doc_id
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._data or {})

    def get(self):
        return self

    def delete(self):
        self._collection.documents.pop(self.id, None)


class FakeDocumentReference:
    def __init__(self, collection, doc_id):
        self._collection = collection
        self.id = doc_id

    def get(self):
        return FakeSnapshot(self._collection, self.id, self._collection.documents.get(self.id))

    def delete(self):
        self._collection.documents.pop(self.id, None)


class FakeQuery:
    def __init__(self, collection, filters=None, order_field=None):
        self._collection = collection
        self._filters = filters or []
        self._order_field = order_field

    def where(self, field, operator, value):
        return FakeQuery(self._collection, [*self._filters, (field, operator, value)], self._order_field)

    def order_by(self, field):
        return FakeQuery(self._collection, self._filters, field)

    def stream(self):
        items = list(self._collection.documents.items())

        for field, operator, value in self._filters:
            if operator != "==":
                raise NotImplementedError(operator)
            items = [(doc_id, data) for doc_id, data in items if data.get(field) == value]

        if self._order_field:
            items.sort(key=lambda item: item[1].get(self._order_field, 0))

        return [FakeSnapshot(self._collection, doc_id, data) for doc_id, data in items]


class FakeCollection:
    def __init__(self):
        self.documents = {}
        self._counter = 0

    def add(self, data):
        self._counter += 1
        doc_id = f"note-{self._counter}"
        self.documents[doc_id] = dict(data)
        return None, FakeDocumentReference(self, doc_id)

    def document(self, doc_id):
        return FakeDocumentReference(self, doc_id)

    def where(self, field, operator, value):
        return FakeQuery(self).where(field, operator, value)


class FakeFirestore:
    def __init__(self):
        self.notes = FakeCollection()

    def collection(self, name):
        if name != "notes":
            raise KeyError(name)
        return self.notes


@pytest.fixture
def fake_db(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(notes_router, "get_firestore_client", lambda: db)
    return db


@pytest.fixture
def client(fake_db):
    app.dependency_overrides[get_current_uid] = lambda: "user-1"
    read_notes_limiter.reset()
    write_notes_limiter.reset()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    read_notes_limiter.reset()
    write_notes_limiter.reset()

