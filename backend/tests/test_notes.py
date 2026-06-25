from app.rate_limit import write_notes_limiter


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

