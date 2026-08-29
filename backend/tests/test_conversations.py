from fastapi.testclient import TestClient
import pytest

from app.ai.client import Completion
from app.ai.service import get_ai_service
from app.dependencies import get_current_uid
from app.main import app
from app.rate_limit import ai_limiter
from app.schemas import AiSuggestionEnvelope, AiSuggestionItem


class StubConversationAi:
    model_name = "deepseek-ai/DeepSeek-V4-Flash"

    def __init__(self):
        self.chat_calls = []
        self.suggestion_calls = []

    async def chat(self, history, text):
        self.chat_calls.append((history, text))
        return Completion(content=f"AI reply to {text}", trace_id="conversation-trace")

    async def suggest_captures(self, transcript, intent):
        self.suggestion_calls.append((transcript, intent))
        return AiSuggestionEnvelope(items=[
            AiSuggestionItem(
                kind="note",
                title="Decision record",
                content="The branch chose the smaller, testable approach.",
            ),
            AiSuggestionItem(
                kind="checkpoint",
                title="Run the prototype",
                content="Validate the branch with a small prototype.",
            ),
        ]), "capture-trace"


@pytest.fixture
def conversation_client(client):
    service = StubConversationAi()
    app.dependency_overrides[get_ai_service] = lambda: service
    yield client, service
    app.dependency_overrides.pop(get_ai_service, None)


def _start(client, text="Plan the release", request_id="request-start-001"):
    return client.post(
        "/conversations",
        json={"text": text, "clientRequestId": request_id},
    )


def test_start_persists_a_connected_user_and_ai_pair(conversation_client, fake_db):
    client, service = conversation_client

    response = _start(client)

    assert response.status_code == 201
    payload = response.json()
    assert payload["title"] == "Plan the release"
    assert payload["messageCount"] == 2
    assert [message["role"] for message in payload["messages"]] == ["user", "assistant"]
    assert payload["messages"][0]["parentId"] is None
    assert payload["messages"][1]["parentId"] == payload["messages"][0]["id"]
    assert service.chat_calls == [([], "Plan the release")]
    assert len(fake_db.conversations.documents) == 1
    assert len(fake_db.conversation_messages.documents) == 2


def test_start_request_id_is_idempotent_without_a_second_model_call(conversation_client):
    client, service = conversation_client

    first = _start(client)
    second = _start(client)

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert len(service.chat_calls) == 1


def test_reply_from_an_earlier_node_uses_only_its_ancestor_path(conversation_client):
    client, service = conversation_client
    started = _start(client).json()
    assistant_id = started["messages"][1]["id"]

    main = client.post(
        f"/conversations/{started['id']}/messages",
        json={
            "parentId": assistant_id,
            "text": "Take the main path",
            "clientRequestId": "request-main-001",
        },
    )
    branch = client.post(
        f"/conversations/{started['id']}/messages",
        json={
            "parentId": assistant_id,
            "text": "Try another branch",
            "clientRequestId": "request-branch-001",
        },
    )

    assert main.status_code == 200
    assert branch.status_code == 200
    assert branch.json()["messageCount"] == 6
    branch_history, branch_text = service.chat_calls[-1]
    assert branch_text == "Try another branch"
    assert [content for _role, content in branch_history] == [
        "Plan the release",
        "AI reply to Plan the release",
    ]
    assert "Take the main path" not in str(branch_history)


def test_unknown_parent_is_rejected_before_ai_generation(conversation_client):
    client, service = conversation_client
    started = _start(client).json()

    response = client.post(
        f"/conversations/{started['id']}/messages",
        json={
            "parentId": "missing-message",
            "text": "Do not generate",
            "clientRequestId": "request-invalid-001",
        },
    )

    assert response.status_code == 404
    assert service.chat_calls == [([], "Plan the release")]


def test_suggestions_do_not_write_until_selected_items_are_confirmed(
    conversation_client,
    fake_db,
):
    client, service = conversation_client
    started = _start(client).json()
    source_id = started["messages"][1]["id"]

    suggestions = client.post(
        f"/conversations/{started['id']}/suggestions",
        json={"messageId": source_id, "intent": "both"},
    )

    assert suggestions.status_code == 200
    assert [item["kind"] for item in suggestions.json()["suggestions"]] == [
        "note",
        "checkpoint",
    ]
    assert fake_db.notes.documents == {}
    assert fake_db.checkpoints.documents == {}
    assert service.suggestion_calls[0][1] == "both"

    captured = client.post(
        f"/conversations/{started['id']}/captures",
        json={
            "sourceMessageId": source_id,
            "clientRequestId": "capture-selected-001",
            "items": [{
                "kind": "checkpoint",
                "title": "Run the prototype",
                "content": "Only this selected item is written.",
            }],
        },
    )

    assert captured.status_code == 201
    assert captured.json()["notes"] == []
    assert len(captured.json()["checkpoints"]) == 1
    assert fake_db.notes.documents == {}
    assert len(fake_db.checkpoints.documents) == 1


def test_capture_is_idempotent_and_notes_remain_compatible(conversation_client, fake_db):
    client, _service = conversation_client
    started = _start(client).json()
    source_id = started["messages"][1]["id"]
    request = {
        "sourceMessageId": source_id,
        "clientRequestId": "capture-note-001",
        "items": [{
            "kind": "note",
            "title": "Approved summary",
            "content": "A user-reviewed summary.",
        }],
    }

    first = client.post(f"/conversations/{started['id']}/captures", json=request)
    second = client.post(f"/conversations/{started['id']}/captures", json=request)

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json() == first.json()
    assert len(fake_db.notes.documents) == 1
    listed = client.get("/notes")
    assert listed.status_code == 200
    assert listed.json()["notes"][0]["text"] == "# Approved summary\n\nA user-reviewed summary."
    assert listed.json()["notes"][0]["tags"] == ["ai-captured", "conversation"]


def test_checkpoint_can_be_completed_and_reopened(conversation_client):
    client, _service = conversation_client
    started = _start(client).json()
    source_id = started["messages"][1]["id"]
    captured = client.post(
        f"/conversations/{started['id']}/captures",
        json={
            "sourceMessageId": source_id,
            "clientRequestId": "capture-task-001",
            "items": [{
                "kind": "checkpoint",
                "title": "Ship it",
                "content": "Run the release checklist.",
            }],
        },
    ).json()
    checkpoint_id = captured["checkpoints"][0]["id"]

    completed = client.patch(f"/checkpoints/{checkpoint_id}", json={"completed": True})
    listed = client.get("/checkpoints")
    reopened = client.patch(f"/checkpoints/{checkpoint_id}", json={"completed": False})

    assert completed.status_code == 200
    assert completed.json()["checkpoint"]["completed"] is True
    assert completed.json()["checkpoint"]["completedAt"] is not None
    assert listed.json()["checkpoints"][0]["id"] == checkpoint_id
    assert reopened.json()["checkpoint"]["completed"] is False
    assert reopened.json()["checkpoint"]["completedAt"] is None


def test_delete_removes_graph_and_receipts_but_preserves_confirmed_items(
    conversation_client,
    fake_db,
):
    client, _service = conversation_client
    started = _start(client).json()
    source_id = started["messages"][1]["id"]
    captured = client.post(
        f"/conversations/{started['id']}/captures",
        json={
            "sourceMessageId": source_id,
            "clientRequestId": "capture-before-delete-001",
            "items": [
                {"kind": "note", "title": "Keep me", "content": "Confirmed note."},
                {"kind": "checkpoint", "title": "Keep task", "content": "Confirmed task."},
            ],
        },
    )
    assert captured.status_code == 201

    deleted = client.delete(f"/conversations/{started['id']}")

    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}
    assert fake_db.conversations.documents == {}
    assert fake_db.conversation_messages.documents == {}
    assert fake_db.capture_batches.documents == {}
    assert len(fake_db.notes.documents) == 1
    assert len(fake_db.checkpoints.documents) == 1
    assert client.get(f"/conversations/{started['id']}").status_code == 404


def test_delete_hides_cross_user_conversations(conversation_client, fake_db):
    client, _service = conversation_client
    started = _start(client).json()
    app.dependency_overrides[get_current_uid] = lambda: "another-user"
    ai_limiter.reset()

    response = client.delete(f"/conversations/{started['id']}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Conversation not found"}
    assert started["id"] in fake_db.conversations.documents


def test_cross_user_conversation_and_message_ids_share_not_found_behavior(
    conversation_client,
):
    client, _service = conversation_client
    started = _start(client).json()
    app.dependency_overrides[get_current_uid] = lambda: "another-user"
    ai_limiter.reset()

    detail = client.get(f"/conversations/{started['id']}")
    reply = client.post(
        f"/conversations/{started['id']}/messages",
        json={
            "parentId": started["messages"][1]["id"],
            "text": "forged",
            "clientRequestId": "request-forged-001",
        },
    )

    assert detail.status_code == 404
    assert reply.status_code == 404
    assert detail.json() == {"detail": "Conversation not found"}
    assert reply.json() == {"detail": "Conversation not found"}


@pytest.mark.parametrize(
    "path,payload",
    [
        ("/conversations", {"text": "hello", "clientRequestId": "short"}),
        ("/conversations", {"text": "hello", "clientRequestId": "valid-id-001", "model": "forged"}),
        ("/conversations/example/messages", {"parentId": "bad/id", "text": "hello", "clientRequestId": "valid-id-001"}),
        ("/conversations/example/captures", {"sourceMessageId": "message", "clientRequestId": "valid-id-001", "items": []}),
    ],
)
def test_conversation_contract_rejects_invalid_or_extra_fields(
    conversation_client,
    path,
    payload,
):
    client, service = conversation_client

    response = client.post(path, json=payload)

    assert response.status_code == 422
    assert service.chat_calls == []


def test_new_routes_require_bearer_authentication(fake_db):
    app.dependency_overrides.clear()
    ai_limiter.reset()
    with TestClient(app) as unauthenticated:
        responses = [
            unauthenticated.get("/conversations"),
            unauthenticated.post(
                "/conversations",
                json={"text": "hello", "clientRequestId": "request-auth-001"},
            ),
            unauthenticated.delete("/conversations/example"),
            unauthenticated.get("/checkpoints"),
        ]

    assert [response.status_code for response in responses] == [401, 401, 401, 401]
