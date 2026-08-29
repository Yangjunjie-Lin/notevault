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


def test_real_firestore_canvas_batches_rehydrate_branches_and_use_indexes(
    integration_client,
    emulator_db,
):
    started = integration_client.post(
        "/conversations",
        json={"text": "Plan the integration release", "clientRequestId": "integration-start-001"},
    )
    assert started.status_code == 201
    root = started.json()
    root_assistant = root["messages"][1]

    replied = integration_client.post(
        f"/conversations/{root['id']}/messages",
        json={
            "parentId": root_assistant["id"],
            "text": "Create an emulator branch",
            "clientRequestId": "integration-reply-001",
        },
    )
    listed = integration_client.get("/conversations")
    loaded = integration_client.get(f"/conversations/{root['id']}")

    assert replied.status_code == 200
    assert listed.status_code == 200
    assert listed.json()["conversations"][0]["messageCount"] == 4
    assert loaded.status_code == 200
    assert [message["role"] for message in loaded.json()["messages"]] == [
        "user", "assistant", "user", "assistant",
    ]
    assert loaded.json()["messages"][2]["parentId"] == root_assistant["id"]
    assert len(list(emulator_db.collection("conversation_messages").stream())) == 4


def test_real_firestore_capture_is_idempotent_and_graph_deletion_preserves_approved_items(
    integration_client,
    emulator_db,
):
    started = integration_client.post(
        "/conversations",
        json={"text": "Prepare approved records", "clientRequestId": "integration-start-002"},
    ).json()
    source_id = started["messages"][1]["id"]
    payload = {
        "sourceMessageId": source_id,
        "clientRequestId": "integration-capture-001",
        "items": [
            {"kind": "note", "title": "Approved note", "content": "Keep this record."},
            {"kind": "checkpoint", "title": "Approved task", "content": "Keep this action."},
        ],
    }

    first = integration_client.post(f"/conversations/{started['id']}/captures", json=payload)
    second = integration_client.post(f"/conversations/{started['id']}/captures", json=payload)
    deleted = integration_client.delete(f"/conversations/{started['id']}")

    assert first.status_code == 201
    assert second.json() == first.json()
    assert deleted.status_code == 200
    assert not emulator_db.collection("conversations").document(started["id"]).get().exists
    assert list(emulator_db.collection("conversation_messages").stream()) == []
    assert list(emulator_db.collection("capture_batches").stream()) == []
    assert len(list(emulator_db.collection("notes").stream())) == 1
    assert len(list(emulator_db.collection("checkpoints").stream())) == 1
    assert integration_client.get("/checkpoints").json()["checkpoints"][0]["title"] == "Approved task"
