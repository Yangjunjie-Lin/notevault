import sys
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.dependencies import get_current_uid  # noqa: E402
from app.main import app  # noqa: E402
from app.rate_limit import ai_limiter, read_notes_limiter, write_notes_limiter  # noqa: E402
from app.routers import notes as notes_router  # noqa: E402
from app.routers import checkpoints as checkpoints_router  # noqa: E402
from app.routers import conversations as conversations_router  # noqa: E402


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
        if self._collection.operation_error:
            raise self._collection.operation_error
        self._collection.document_gets.append(self.id)
        return FakeSnapshot(self._collection, self.id, self._collection.documents.get(self.id))

    def delete(self):
        if self._collection.operation_error:
            raise self._collection.operation_error
        self._collection.documents.pop(self.id, None)

    def update(self, data):
        if self._collection.operation_error:
            raise self._collection.operation_error
        self._collection.documents[self.id].update(dict(data))

    def set(self, data):
        if self._collection.operation_error:
            raise self._collection.operation_error
        self._collection.documents[self.id] = dict(data)


class FakeQuery:
    def __init__(
        self,
        collection,
        filters=None,
        order_fields=None,
        page_limit=None,
        after_values=None,
    ):
        self._collection = collection
        self._filters = filters or []
        self._order_fields = order_fields or []
        self._page_limit = page_limit
        self._after_values = after_values

    def where(self, field=None, operator=None, value=None, *, filter=None):
        if filter is not None:
            field, operator, value = filter.field_path, filter.op_string, filter.value
        return FakeQuery(
            self._collection,
            [*self._filters, (field, operator, value)],
            self._order_fields,
            self._page_limit,
            self._after_values,
        )

    def order_by(self, field, direction=None):
        return FakeQuery(
            self._collection,
            self._filters,
            [*self._order_fields, (field, direction)],
            self._page_limit,
            self._after_values,
        )

    def limit(self, value):
        return FakeQuery(
            self._collection,
            self._filters,
            self._order_fields,
            value,
            self._after_values,
        )

    def start_after(self, document_fields):
        if isinstance(document_fields, FakeSnapshot):
            values = {
                field: _sort_value((document_fields.id, document_fields.to_dict()), field)
                for field, _ in self._order_fields
            }
        else:
            values = dict(document_fields)
        return FakeQuery(
            self._collection,
            self._filters,
            self._order_fields,
            self._page_limit,
            values,
        )

    def stream(self):
        if self._collection.operation_error:
            raise self._collection.operation_error

        items = list(self._collection.documents.items())

        for field, operator, value in self._filters:
            if operator != "==":
                raise NotImplementedError(operator)
            items = [(doc_id, data) for doc_id, data in items if data.get(field) == value]

        for field, direction in reversed(self._order_fields):
            reverse = str(direction).upper().endswith("DESCENDING")
            items.sort(key=lambda item: _sort_value(item, field), reverse=reverse)

        if self._after_values:
            items = [item for item in items if self._is_after_cursor(item)]

        if self._page_limit is not None:
            items = items[: self._page_limit]

        return [FakeSnapshot(self._collection, doc_id, data) for doc_id, data in items]

    def _is_after_cursor(self, item):
        for field, direction in self._order_fields:
            item_value = _sort_value(item, field)
            cursor_value = self._after_values[field]
            cursor_value = getattr(cursor_value, "id", cursor_value)
            if item_value == cursor_value:
                continue
            descending = str(direction).upper().endswith("DESCENDING")
            return item_value < cursor_value if descending else item_value > cursor_value
        return False


class FakeCollection:
    def __init__(self, prefix="doc"):
        self.documents = {}
        self._counter = 0
        self._prefix = prefix
        self.operation_error = None
        self.document_gets = []

    def add(self, data):
        if self.operation_error:
            raise self.operation_error
        self._counter += 1
        doc_id = f"{self._prefix}-{self._counter}"
        self.documents[doc_id] = dict(data)
        return None, FakeDocumentReference(self, doc_id)

    def document(self, doc_id):
        return FakeDocumentReference(self, doc_id)

    def where(self, field=None, operator=None, value=None, *, filter=None):
        return FakeQuery(self).where(field, operator, value, filter=filter)


class FakeWriteBatch:
    def __init__(self):
        self.operations = []

    def set(self, document, data):
        self.operations.append(("set", document, dict(data)))
        return self

    def delete(self, document):
        self.operations.append(("delete", document, None))
        return self

    def commit(self):
        for operation, document, data in self.operations:
            if operation == "set":
                document.set(data)
            else:
                document.delete()
        return []


def _sort_value(item, field):
    doc_id, data = item
    if field == "__name__":
        return doc_id
    value = data.get(field, 0)
    if isinstance(value, datetime):
        return value.timestamp() * 1000
    return value


class FakeFirestore:
    def __init__(self):
        self.notes = FakeCollection("note")
        self.conversations = FakeCollection("conversation")
        self.conversation_messages = FakeCollection("message")
        self.checkpoints = FakeCollection("checkpoint")
        self.capture_batches = FakeCollection("capture")
        self._collections = {
            "notes": self.notes,
            "conversations": self.conversations,
            "conversation_messages": self.conversation_messages,
            "checkpoints": self.checkpoints,
            "capture_batches": self.capture_batches,
        }

    def collection(self, name):
        if name not in self._collections:
            self._collections[name] = FakeCollection(name.rstrip("s"))
        return self._collections[name]

    def batch(self):
        return FakeWriteBatch()


@pytest.fixture
def fake_db(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(notes_router, "get_firestore_client", lambda: db)
    monkeypatch.setattr(conversations_router, "get_firestore_client", lambda: db)
    monkeypatch.setattr(checkpoints_router, "get_firestore_client", lambda: db)
    return db


@pytest.fixture
def client(fake_db):
    app.dependency_overrides[get_current_uid] = lambda: "user-1"
    read_notes_limiter.reset()
    write_notes_limiter.reset()
    ai_limiter.reset()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    read_notes_limiter.reset()
    write_notes_limiter.reset()
    ai_limiter.reset()
