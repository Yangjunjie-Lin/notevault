from datetime import datetime, timezone

import pytest

from app.dependencies import get_current_uid
from app.main import app


pytestmark = pytest.mark.integration


def set_note(
    database,
    note_id: str,
    *,
    uid: str = "integration-user",
    text: str = "Integration note",
    tags: list[str] | None = None,
    created_at=1_000,
):
    database.collection("notes").document(note_id).set(
        {
            "uid": uid,
            "text": text,
            "tags": tags or [],
            "createdAt": created_at,
        }
    )


def test_real_firestore_cursor_survives_deleted_boundary_and_stays_ordered(
    integration_client,
    emulator_db,
):
    for index in range(25):
        set_note(
            emulator_db,
            f"note-{index:02}",
            text=f"Note {index:02}",
            tags=["pages"],
            created_at=1_780_000_000_000,
        )

    first = integration_client.get("/notes")
    first_payload = first.json()
    first_ids = [note["id"] for note in first_payload["notes"]]
    boundary_id = first_ids[-1]
    assert first.status_code == 200
    assert first_ids == sorted(first_ids, reverse=True)
    assert first_payload["hasMore"] is True

    emulator_db.collection("notes").document(boundary_id).update(
        {"text": "Edited boundary", "tags": ["changed"]}
    )
    assert integration_client.delete(f"/notes/{boundary_id}").status_code == 200
    second = integration_client.get(
        "/notes", params={"cursor": first_payload["nextCursor"]}
    )

    assert second.status_code == 200
    second_ids = [note["id"] for note in second.json()["notes"]]
    assert second_ids == [f"note-{index:02}" for index in range(4, -1, -1)]
    assert set(first_ids).isdisjoint(second_ids)
    assert len((set(first_ids) - {boundary_id}) | set(second_ids)) == 24


def test_real_firestore_owner_isolation_update_and_delete(
    integration_client,
    emulator_db,
):
    set_note(emulator_db, "owned", text="Owned", tags=["old"], created_at=2_000)
    set_note(emulator_db, "other", uid="other-user", text="Private", created_at=3_000)

    listed = integration_client.get("/notes")
    assert [note["id"] for note in listed.json()["notes"]] == ["owned"]
    assert integration_client.patch(
        "/notes/other", json={"text": "Attempted update"}
    ).status_code == 404
    assert integration_client.delete("/notes/other").status_code == 404

    updated = integration_client.patch(
        "/notes/owned", json={"text": "Updated", "tags": ["work"]}
    )
    assert updated.status_code == 200
    assert updated.json()["note"]["createdAt"] == 2_000
    assert updated.json()["note"]["tags"] == ["work"]
    assert integration_client.delete("/notes/owned").status_code == 200
    assert not emulator_db.collection("notes").document("owned").get().exists

    app.dependency_overrides[get_current_uid] = lambda: "other-user"
    assert emulator_db.collection("notes").document("other").get().exists


def test_real_firestore_timestamp_values_match_the_api_contract(
    integration_client,
    emulator_db,
):
    created_at = datetime(2026, 7, 14, 10, 0, tzinfo=timezone.utc)
    set_note(emulator_db, "timestamp-note", created_at=created_at)

    response = integration_client.get("/notes")

    assert response.status_code == 200
    assert response.json()["notes"][0]["createdAt"] == 1_784_023_200_000
