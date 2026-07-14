from datetime import datetime, timezone

from app.dependencies import get_current_uid
from app.main import app
from app.rate_limit import write_notes_limiter
from app.routers import notes as notes_router
from google.api_core.exceptions import GoogleAPICallError


def seed_note(fake_db, doc_id, uid="user-1", text="Example", tags=None, created_at=1000):
    fake_db.notes.documents[doc_id] = {
        "uid": uid,
        "text": text,
        "tags": tags or [],
        "createdAt": created_at,
    }


def test_health_check(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_create_note_normalizes_tags(client, fake_db):
    response = client.post(
        "/notes",
        json={
            "text": "# Launch plan",
            "tags": [" Work ", "work", "Ideas"],
        },
    )

    assert response.status_code == 201
    note = response.json()["note"]
    assert note["text"] == "# Launch plan"
    assert note["tags"] == ["work", "ideas"]

    stored_note = fake_db.notes.documents[note["id"]]
    assert stored_note["uid"] == "user-1"
    assert stored_note["tags"] == ["work", "ideas"]


def test_list_notes_supports_search_and_tag_filters(client, fake_db):
    seed_note(fake_db, "a", text="Meeting notes", tags=["work"], created_at=1000)
    seed_note(fake_db, "b", text="Book quote", tags=["reading"], created_at=2000)
    seed_note(fake_db, "c", uid="user-2", text="Meeting notes", tags=["work"], created_at=3000)

    search_response = client.get("/notes?q=meeting")
    tag_response = client.get("/notes?tag=reading")

    assert search_response.status_code == 200
    assert [note["id"] for note in search_response.json()["notes"]] == ["a"]

    assert tag_response.status_code == 200
    assert [note["id"] for note in tag_response.json()["notes"]] == ["b"]


def test_list_notes_sorts_without_requiring_a_composite_index(client, fake_db):
    seed_note(fake_db, "older", created_at=1000)
    seed_note(fake_db, "newer", created_at=3000)
    seed_note(fake_db, "middle", created_at=2000)

    response = client.get("/notes")

    assert response.status_code == 200
    assert [note["id"] for note in response.json()["notes"]] == ["newer", "middle", "older"]


def test_list_notes_normalizes_legacy_firestore_timestamps(client, fake_db):
    seed_note(
        fake_db,
        "legacy",
        created_at=datetime(2026, 7, 14, 10, 0, tzinfo=timezone.utc),
    )
    seed_note(fake_db, "current", created_at=1784026800000)

    response = client.get("/notes")

    assert response.status_code == 200
    notes = response.json()["notes"]
    assert [note["id"] for note in notes] == ["current", "legacy"]
    assert notes[1]["createdAt"] == 1784023200000


def test_list_notes_returns_readable_error_when_firestore_is_unavailable(client, fake_db):
    fake_db.notes.operation_error = GoogleAPICallError("Firestore unavailable")

    response = client.get(
        "/notes",
        headers={"Origin": "http://localhost:5173"},
    )

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Notes are temporarily unavailable. Please try again."
    }
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_delete_note_hides_other_users_notes(client, fake_db):
    seed_note(fake_db, "other-user-note", uid="user-2")

    response = client.delete("/notes/other-user-note")

    assert response.status_code == 404
    assert "other-user-note" in fake_db.notes.documents


def test_write_rate_limit_returns_429(client):
    original_limit = write_notes_limiter.max_requests
    write_notes_limiter.max_requests = 1
    write_notes_limiter.reset()

    try:
        first_response = client.post("/notes", json={"text": "First"})
        second_response = client.post("/notes", json={"text": "Second"})
    finally:
        write_notes_limiter.max_requests = original_limit
        write_notes_limiter.reset()

    assert first_response.status_code == 201
    assert second_response.status_code == 429


def test_owner_can_update_note_and_preserves_created_at(client, fake_db, monkeypatch):
    seed_note(fake_db, "owned", text=" Original ", tags=["old"], created_at=1234)
    monkeypatch.setattr(notes_router.time, "time", lambda: 2.5)

    response = client.patch(
        "/notes/owned",
        json={"text": "  Updated Markdown  ", "tags": [" Work ", "work", "Ideas"]},
    )

    assert response.status_code == 200
    assert response.json()["note"] == {
        "id": "owned",
        "text": "Updated Markdown",
        "tags": ["work", "ideas"],
        "createdAt": 1234,
        "updatedAt": 2500,
    }
    assert fake_db.notes.documents["owned"]["createdAt"] == 1234
    assert fake_db.notes.documents["owned"]["uid"] == "user-1"


def test_update_missing_and_other_users_notes_both_return_404(client, fake_db):
    seed_note(fake_db, "other", uid="user-2")

    missing = client.patch("/notes/missing", json={"text": "Updated"})
    other = client.patch("/notes/other", json={"text": "Updated"})

    assert missing.status_code == 404
    assert other.status_code == 404
    assert fake_db.notes.documents["other"]["text"] == "Example"


def test_update_validates_empty_oversized_and_uid_fields(client, fake_db):
    seed_note(fake_db, "owned")

    assert client.patch("/notes/owned", json={"text": "   "}).status_code == 422
    assert client.patch("/notes/owned", json={"text": "x" * 5001}).status_code == 422
    assert client.patch(
        "/notes/owned", json={"text": "Updated", "uid": "user-2"}
    ).status_code == 422
    assert fake_db.notes.documents["owned"]["uid"] == "user-1"


def test_update_firestore_failure_is_sanitized(client, fake_db):
    seed_note(fake_db, "owned")
    fake_db.notes.operation_error = GoogleAPICallError("internal database detail")

    response = client.patch("/notes/owned", json={"text": "Updated"})

    assert response.status_code == 503
    assert response.json()["detail"] == "Notes are temporarily unavailable. Please try again."
    assert "internal" not in response.text


def test_update_uses_write_rate_limit(client, fake_db):
    seed_note(fake_db, "owned")
    original_limit = write_notes_limiter.max_requests
    write_notes_limiter.max_requests = 1
    write_notes_limiter.reset()
    try:
        first = client.patch("/notes/owned", json={"text": "First"})
        second = client.patch("/notes/owned", json={"text": "Second"})
    finally:
        write_notes_limiter.max_requests = original_limit
        write_notes_limiter.reset()

    assert first.status_code == 200
    assert second.status_code == 429


def test_pagination_defaults_to_twenty_and_returns_stable_cursor(client, fake_db):
    for index in range(23):
        seed_note(fake_db, f"note-{index:02}", created_at=1000)

    first = client.get("/notes")
    payload = first.json()
    assert first.status_code == 200
    assert len(payload["notes"]) == 20
    assert payload["hasMore"] is True
    assert payload["nextCursor"]
    assert [note["id"] for note in payload["notes"]][:2] == ["note-22", "note-21"]

    second = client.get("/notes", params={"cursor": payload["nextCursor"]})
    second_payload = second.json()
    assert [note["id"] for note in second_payload["notes"]] == [
        "note-02", "note-01", "note-00"
    ]
    assert second_payload["hasMore"] is False
    assert set(note["id"] for note in payload["notes"]).isdisjoint(
        note["id"] for note in second_payload["notes"]
    )


def test_pagination_custom_and_maximum_limit(client, fake_db):
    for index in range(6):
        seed_note(fake_db, str(index), created_at=index)

    assert len(client.get("/notes?limit=3").json()["notes"]) == 3
    assert client.get("/notes?limit=50").status_code == 200
    assert client.get("/notes?limit=51").status_code == 422
    assert client.get("/notes?limit=0").status_code == 422


def test_invalid_changed_filter_and_cross_user_cursors_return_400(client, fake_db):
    for index in range(3):
        seed_note(fake_db, str(index), text="meeting", created_at=index)

    assert client.get("/notes?cursor=not-a-cursor").status_code == 400

    search_cursor = client.get("/notes?limit=1&q=meeting").json()["nextCursor"]
    assert client.get(
        "/notes", params={"limit": 1, "q": "different", "cursor": search_cursor}
    ).status_code == 400

    page_cursor = client.get("/notes?limit=1").json()["nextCursor"]
    app.dependency_overrides[get_current_uid] = lambda: "user-2"
    assert client.get("/notes", params={"cursor": page_cursor}).status_code == 400


def test_filtered_search_is_paginated_and_reports_scan_cap(client, fake_db):
    for index in range(notes_router.SEARCH_SCAN_LIMIT + 1):
        seed_note(
            fake_db,
            f"note-{index:03}",
            text="Meeting notes" if index % 2 == 0 else "Other",
            tags=["work"],
            created_at=index,
        )

    first = client.get("/notes?limit=5&q=meeting&tag=work").json()
    assert len(first["notes"]) == 5
    assert first["hasMore"] is True
    assert first["searchLimited"] is True

    second = client.get(
        "/notes", params={"limit": 5, "q": "meeting", "tag": "work", "cursor": first["nextCursor"]}
    ).json()
    assert len(second["notes"]) == 5
    assert set(note["id"] for note in first["notes"]).isdisjoint(
        note["id"] for note in second["notes"]
    )


def test_empty_final_page_and_legacy_updated_timestamp(client, fake_db):
    seed_note(
        fake_db,
        "legacy",
        created_at=datetime(2026, 7, 14, 10, 0, tzinfo=timezone.utc),
    )
    fake_db.notes.documents["legacy"]["updatedAt"] = datetime(
        2026, 7, 14, 11, 0, tzinfo=timezone.utc
    )

    response = client.get("/notes")
    assert response.json()["notes"][0]["updatedAt"] == 1784026800000
    assert response.json()["nextCursor"] is None
    assert response.json()["hasMore"] is False
