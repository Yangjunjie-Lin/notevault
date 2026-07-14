import base64
import json

import pytest

from app.cursor import decode_cursor, encode_cursor, filter_fingerprint
from app.dependencies import get_current_uid
from app.main import app


def seed_note(
    fake_db,
    doc_id: str,
    *,
    uid: str = "user-1",
    text: str = "Example",
    tags: list[str] | None = None,
    created_at: int = 1_000,
):
    fake_db.notes.documents[doc_id] = {
        "uid": uid,
        "text": text,
        "tags": tags or [],
        "createdAt": created_at,
    }


def tamper_payload(cursor: str, **changes: object) -> str:
    encoded, signature = cursor.split(".", 1)
    padding = "=" * (-len(encoded) % 4)
    payload = json.loads(base64.urlsafe_b64decode(encoded + padding))
    payload.update(changes)
    changed = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    ).rstrip(b"=").decode()
    return f"{changed}.{signature}"


def seed_page_set(fake_db, count: int = 30):
    for index in range(count):
        seed_note(
            fake_db,
            f"note-{index:02}",
            text=f"Note {index:02}",
            tags=["pages"],
            created_at=1_000,
        )


def test_delete_cursor_boundary_then_load_next_page(client, fake_db):
    seed_page_set(fake_db)
    first = client.get("/notes").json()
    boundary_id = first["notes"][-1]["id"]

    assert client.delete(f"/notes/{boundary_id}").status_code == 200
    second = client.get("/notes", params={"cursor": first["nextCursor"]})

    assert second.status_code == 200
    first_ids = {note["id"] for note in first["notes"] if note["id"] != boundary_id}
    second_ids = {note["id"] for note in second.json()["notes"]}
    assert second_ids == {f"note-{index:02}" for index in range(10)}
    assert first_ids.isdisjoint(second_ids)


def test_delete_non_boundary_then_load_next_page(client, fake_db):
    seed_page_set(fake_db)
    first = client.get("/notes").json()
    non_boundary_id = first["notes"][0]["id"]

    assert client.delete(f"/notes/{non_boundary_id}").status_code == 200
    second = client.get("/notes", params={"cursor": first["nextCursor"]})

    assert second.status_code == 200
    assert {note["id"] for note in first["notes"]}.isdisjoint(
        note["id"] for note in second.json()["notes"]
    )


def test_cursor_continuation_does_not_fetch_boundary_snapshot(client, fake_db):
    seed_page_set(fake_db)
    first = client.get("/notes").json()
    fake_db.notes.document_gets.clear()

    response = client.get("/notes", params={"cursor": first["nextCursor"]})

    assert response.status_code == 200
    assert fake_db.notes.document_gets == []


def test_cursor_remains_valid_after_editing_boundary_text_and_tags(client, fake_db):
    seed_page_set(fake_db)
    first = client.get("/notes").json()
    boundary_id = first["notes"][-1]["id"]

    updated = client.patch(
        f"/notes/{boundary_id}",
        json={"text": "Edited boundary", "tags": ["changed"]},
    )
    second = client.get("/notes", params={"cursor": first["nextCursor"]})

    assert updated.status_code == 200
    assert second.status_code == 200
    assert len(second.json()["notes"]) == 10


def test_cursor_cannot_cross_users_or_filters(client, fake_db):
    seed_page_set(fake_db)
    page_cursor = client.get("/notes?limit=1").json()["nextCursor"]
    search_cursor = client.get("/notes?limit=1&q=note").json()["nextCursor"]

    app.dependency_overrides[get_current_uid] = lambda: "user-2"
    assert client.get("/notes", params={"cursor": page_cursor}).status_code == 400
    app.dependency_overrides[get_current_uid] = lambda: "user-1"

    assert client.get(
        "/notes", params={"cursor": search_cursor, "q": "different"}
    ).status_code == 400
    assert client.get(
        "/notes", params={"cursor": search_cursor, "q": "note", "tag": "pages"}
    ).status_code == 400


@pytest.mark.parametrize(
    ("field", "value"),
    [("createdAt", 999_999), ("id", "different-document")],
)
def test_cursor_rejects_modified_continuation_fields(client, fake_db, field, value):
    seed_page_set(fake_db)
    cursor = client.get("/notes?limit=1").json()["nextCursor"]

    assert client.get(
        "/notes", params={"cursor": tamper_payload(cursor, **{field: value})}
    ).status_code == 400


def test_cursor_version_validation(client, fake_db):
    seed_page_set(fake_db)
    v1_cursor = encode_cursor(
        {
            "v": 1,
            "mode": "page",
            "uid": "user-1",
            "fp": filter_fingerprint(None, None),
            "createdAt": 1_000,
            "id": "note-29",
        }
    )
    current = client.get("/notes?limit=1").json()["nextCursor"]

    assert client.get("/notes", params={"cursor": v1_cursor}).status_code == 400
    assert decode_cursor(current)["v"] == 2


def test_no_duplicate_ids_and_stable_identical_timestamp_order(client, fake_db):
    seed_page_set(fake_db, count=41)
    seen: list[str] = []
    cursor = None

    while True:
        response = client.get("/notes", params={"limit": 7, "cursor": cursor}).json()
        seen.extend(note["id"] for note in response["notes"])
        cursor = response["nextCursor"]
        if not response["hasMore"]:
            break

    assert seen == sorted(seen, reverse=True)
    assert len(seen) == len(set(seen)) == 41


def test_new_note_after_first_page_does_not_corrupt_continuation(client, fake_db):
    seed_page_set(fake_db)
    first = client.get("/notes").json()
    seed_note(fake_db, "new-top", created_at=2_000)

    second = client.get("/notes", params={"cursor": first["nextCursor"]}).json()

    assert "new-top" not in {note["id"] for note in second["notes"]}
    assert {note["id"] for note in first["notes"]}.isdisjoint(
        note["id"] for note in second["notes"]
    )


def test_empty_final_page_after_tail_is_deleted(client, fake_db):
    seed_note(fake_db, "newer", created_at=2_000)
    seed_note(fake_db, "older", created_at=1_000)
    first = client.get("/notes?limit=1").json()
    del fake_db.notes.documents["older"]

    final = client.get("/notes", params={"limit": 1, "cursor": first["nextCursor"]})

    assert final.status_code == 200
    assert final.json()["notes"] == []
    assert final.json()["hasMore"] is False
    assert final.json()["nextCursor"] is None
