"""Authenticated, persisted branching conversation workflows."""

from __future__ import annotations

from hashlib import sha256
import logging
import re
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from google.api_core.exceptions import GoogleAPICallError
from google.cloud.firestore_v1 import Query as FirestoreQuery
from google.cloud.firestore_v1.base_query import FieldFilter
from starlette.concurrency import run_in_threadpool

from ..ai.service import AiService, get_ai_service
from ..firebase import get_firestore_client
from ..rate_limit import ai_limited_uid, read_limited_uid, write_limited_uid
from ..schemas import (
    CaptureItem,
    CaptureItemsRequest,
    CaptureItemsResponse,
    CaptureSuggestion,
    CaptureSuggestionRequest,
    CaptureSuggestionsResponse,
    CheckpointOut,
    ConversationDetail,
    ConversationMessageOut,
    ConversationReplyRequest,
    ConversationsResponse,
    ConversationStartRequest,
    ConversationSummary,
    DeleteConversationResponse,
    NoteOut,
)
from .ai import AI_ERROR_RESPONSES


router = APIRouter(prefix="/conversations", tags=["conversations"])
logger = logging.getLogger(__name__)
MAX_CONVERSATIONS = 50
MAX_MESSAGES = 500
MAX_CONTEXT_MESSAGES = 24


@router.get("", response_model=ConversationsResponse)
def list_conversations(uid: str = Depends(read_limited_uid)) -> ConversationsResponse:
    try:
        snapshots = list(
            get_firestore_client()
            .collection("conversations")
            .where(filter=FieldFilter("uid", "==", uid))
            .order_by("updatedAt", direction=FirestoreQuery.DESCENDING)
            .limit(MAX_CONVERSATIONS)
            .stream()
        )
        return ConversationsResponse(
            conversations=[_summary(snapshot.id, snapshot.to_dict()) for snapshot in snapshots]
        )
    except GoogleAPICallError as exc:
        logger.exception("Firestore failed while listing conversations")
        raise _storage_unavailable() from exc


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: str,
    uid: str = Depends(read_limited_uid),
) -> ConversationDetail:
    try:
        db = get_firestore_client()
        conversation = _owned_conversation(db, conversation_id, uid)
        return _detail(db, conversation_id, conversation)
    except HTTPException:
        raise
    except GoogleAPICallError as exc:
        logger.exception("Firestore failed while loading a conversation")
        raise _storage_unavailable() from exc


@router.delete("/{conversation_id}", response_model=DeleteConversationResponse)
def delete_conversation(
    conversation_id: str,
    uid: str = Depends(write_limited_uid),
) -> DeleteConversationResponse:
    """Delete a private graph while preserving already captured notes/checkpoints."""
    try:
        db = get_firestore_client()
        _owned_conversation(db, conversation_id, uid)
        _delete_conversation_graph(db, conversation_id, uid)
        return DeleteConversationResponse(ok=True)
    except HTTPException:
        raise
    except GoogleAPICallError as exc:
        logger.exception("Firestore failed while deleting a conversation")
        raise _storage_unavailable() from exc


@router.post(
    "",
    response_model=ConversationDetail,
    status_code=status.HTTP_201_CREATED,
    responses=AI_ERROR_RESPONSES,
)
async def start_conversation(
    payload: ConversationStartRequest,
    uid: str = Depends(ai_limited_uid),
    service: AiService = Depends(get_ai_service),
) -> ConversationDetail:
    existing = await run_in_threadpool(
        _conversation_for_request,
        get_firestore_client(),
        uid,
        payload.clientRequestId,
    )
    if existing is not None:
        conversation_id, conversation = existing
        return await run_in_threadpool(
            _detail,
            get_firestore_client(),
            conversation_id,
            conversation,
        )
    completion = await service.chat([], payload.text)
    try:
        return await run_in_threadpool(
            _persist_new_conversation,
            uid,
            payload.text,
            completion.content,
            payload.clientRequestId,
            completion.trace_id,
        )
    except GoogleAPICallError as exc:
        logger.exception("Firestore failed while creating a conversation")
        raise _storage_unavailable() from exc


@router.post(
    "/{conversation_id}/messages",
    response_model=ConversationDetail,
    responses=AI_ERROR_RESPONSES,
)
async def reply_to_conversation(
    conversation_id: str,
    payload: ConversationReplyRequest,
    uid: str = Depends(ai_limited_uid),
    service: AiService = Depends(get_ai_service),
) -> ConversationDetail:
    try:
        db = get_firestore_client()
        conversation, messages = await run_in_threadpool(
            _conversation_with_messages,
            db,
            conversation_id,
            uid,
        )
        if await run_in_threadpool(
            _request_exists,
            db,
            conversation_id,
            uid,
            payload.clientRequestId,
        ):
            return _detail_from_messages(conversation_id, conversation, messages)
        if int(conversation.get("messageCount", len(messages))) + 2 > MAX_MESSAGES:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This conversation has reached its message limit",
            )
        path = _branch_to(messages, payload.parentId)
        history = [(message.role, message.content) for message in path]
        completion = await service.chat(history, payload.text)
        return await run_in_threadpool(
            _persist_reply,
            db,
            conversation_id,
            uid,
            payload,
            completion.content,
            completion.trace_id,
        )
    except HTTPException:
        raise
    except GoogleAPICallError as exc:
        logger.exception("Firestore failed while adding a conversation branch")
        raise _storage_unavailable() from exc


@router.post(
    "/{conversation_id}/suggestions",
    response_model=CaptureSuggestionsResponse,
    responses=AI_ERROR_RESPONSES,
)
async def suggest_captures(
    conversation_id: str,
    payload: CaptureSuggestionRequest,
    uid: str = Depends(ai_limited_uid),
    service: AiService = Depends(get_ai_service),
) -> CaptureSuggestionsResponse:
    try:
        db = get_firestore_client()
        _conversation, messages = await run_in_threadpool(
            _conversation_with_messages,
            db,
            conversation_id,
            uid,
        )
        path = _branch_to(messages, payload.messageId)
        transcript = [(message.role, message.content) for message in path]
        envelope, trace_id = await service.suggest_captures(transcript, payload.intent)
        suggestions = [
            CaptureSuggestion(
                id=f"candidate-{index + 1}",
                kind=item.kind,
                title=item.title,
                content=item.content,
            )
            for index, item in enumerate(envelope.items)
        ]
        return CaptureSuggestionsResponse(
            suggestions=suggestions,
            model=service.model_name,
            traceId=trace_id,
        )
    except HTTPException:
        raise
    except GoogleAPICallError as exc:
        logger.exception("Firestore failed while preparing capture suggestions")
        raise _storage_unavailable() from exc


@router.post(
    "/{conversation_id}/captures",
    response_model=CaptureItemsResponse,
    status_code=status.HTTP_201_CREATED,
)
def capture_items(
    conversation_id: str,
    payload: CaptureItemsRequest,
    uid: str = Depends(write_limited_uid),
) -> CaptureItemsResponse:
    try:
        db = get_firestore_client()
        conversation = _owned_conversation(db, conversation_id, uid)
        messages = _conversation_messages(db, conversation_id, uid)
        _branch_to(messages, payload.sourceMessageId)
        return _persist_capture_batch(db, conversation_id, conversation, uid, payload)
    except HTTPException:
        raise
    except GoogleAPICallError as exc:
        logger.exception("Firestore failed while capturing conversation items")
        raise _storage_unavailable() from exc


def _persist_new_conversation(
    uid: str,
    text: str,
    reply: str,
    client_request_id: str,
    trace_id: str | None,
) -> ConversationDetail:
    db = get_firestore_client()
    existing = _conversation_for_request(db, uid, client_request_id)
    if existing is not None:
        conversation_id, conversation = existing
        return _detail(db, conversation_id, conversation)
    now = int(time.time() * 1000)
    conversation_id = _stable_id("conversation", uid, client_request_id)
    user_id = _stable_id("message", conversation_id, client_request_id, "user")
    assistant_id = _stable_id("message", conversation_id, client_request_id, "assistant")
    conversation_data = {
        "uid": uid,
        "title": _conversation_title(text),
        "createdAt": now,
        "updatedAt": now + 1,
        "messageCount": 2,
        "clientRequestId": client_request_id,
    }
    user_data = {
        "uid": uid,
        "conversationId": conversation_id,
        "parentId": None,
        "role": "user",
        "content": text,
        "createdAt": now,
        "clientRequestId": client_request_id,
    }
    assistant_data = {
        "uid": uid,
        "conversationId": conversation_id,
        "parentId": user_id,
        "role": "assistant",
        "content": reply,
        "createdAt": now + 1,
        "clientRequestId": client_request_id,
        "providerTraceId": trace_id,
    }
    batch = db.batch()
    batch.set(db.collection("conversations").document(conversation_id), conversation_data)
    batch.set(db.collection("conversation_messages").document(user_id), user_data)
    batch.set(db.collection("conversation_messages").document(assistant_id), assistant_data)
    batch.commit()
    return ConversationDetail(
        **_summary(conversation_id, conversation_data).model_dump(),
        messages=[
            _message(user_id, user_data),
            _message(assistant_id, assistant_data),
        ],
    )


def _persist_reply(
    db: Any,
    conversation_id: str,
    uid: str,
    payload: ConversationReplyRequest,
    reply: str,
    trace_id: str | None,
) -> ConversationDetail:
    conversation = _owned_conversation(db, conversation_id, uid)
    messages = _conversation_messages(db, conversation_id, uid)
    if _request_exists(db, conversation_id, uid, payload.clientRequestId):
        return _detail_from_messages(conversation_id, conversation, messages)
    _branch_to(messages, payload.parentId)
    now = int(time.time() * 1000)
    user_id = _stable_id("message", conversation_id, payload.clientRequestId, "user")
    assistant_id = _stable_id("message", conversation_id, payload.clientRequestId, "assistant")
    user_data = {
        "uid": uid,
        "conversationId": conversation_id,
        "parentId": payload.parentId,
        "role": "user",
        "content": payload.text,
        "createdAt": now,
        "clientRequestId": payload.clientRequestId,
    }
    assistant_data = {
        "uid": uid,
        "conversationId": conversation_id,
        "parentId": user_id,
        "role": "assistant",
        "content": reply,
        "createdAt": now + 1,
        "clientRequestId": payload.clientRequestId,
        "providerTraceId": trace_id,
    }
    updated = {**conversation, "updatedAt": now + 1, "messageCount": len(messages) + 2}
    batch = db.batch()
    batch.set(db.collection("conversation_messages").document(user_id), user_data)
    batch.set(db.collection("conversation_messages").document(assistant_id), assistant_data)
    batch.set(db.collection("conversations").document(conversation_id), updated)
    batch.commit()
    return _detail_from_messages(
        conversation_id,
        updated,
        [*messages, _message(user_id, user_data), _message(assistant_id, assistant_data)],
    )


def _delete_conversation_graph(
    db: Any,
    conversation_id: str,
    uid: str,
) -> None:
    message_snapshots = list(
        db.collection("conversation_messages")
        .where(filter=FieldFilter("uid", "==", uid))
        .where(filter=FieldFilter("conversationId", "==", conversation_id))
        .stream()
    )
    receipt_snapshots = list(
        db.collection("capture_batches")
        .where(filter=FieldFilter("conversationId", "==", conversation_id))
        .stream()
    )
    references = [
        db.collection("conversation_messages").document(snapshot.id)
        for snapshot in message_snapshots
    ]
    references.extend(
        db.collection("capture_batches").document(snapshot.id)
        for snapshot in receipt_snapshots
        if snapshot.to_dict().get("uid") == uid
    )
    # The parent is always last. If a prior chunk succeeds and a later one
    # fails, retrying remains safe because the owned conversation still exists.
    references.append(db.collection("conversations").document(conversation_id))
    for offset in range(0, len(references), 450):
        batch = db.batch()
        for reference in references[offset:offset + 450]:
            batch.delete(reference)
        batch.commit()


def _persist_capture_batch(
    db: Any,
    conversation_id: str,
    _conversation: dict[str, Any],
    uid: str,
    payload: CaptureItemsRequest,
) -> CaptureItemsResponse:
    batch_id = sha256(
        f"{uid}:{conversation_id}:{payload.clientRequestId}".encode("utf-8")
    ).hexdigest()
    batch_ref = db.collection("capture_batches").document(batch_id)
    existing = batch_ref.get()
    if existing.exists:
        return _capture_response_from_ids(db, existing.to_dict(), uid)

    notes: list[NoteOut] = []
    checkpoints: list[CheckpointOut] = []
    now = int(time.time() * 1000)
    batch = db.batch()
    for index, item in enumerate(payload.items):
        item_time = now + index
        target_id = sha256(f"{batch_id}:{index}:{item.kind}".encode("utf-8")).hexdigest()
        if item.kind == "note":
            note_data = {
                "uid": uid,
                "text": _captured_note_text(item),
                "tags": ["ai-captured", "conversation"],
                "createdAt": item_time,
                "sourceConversationId": conversation_id,
                "sourceMessageId": payload.sourceMessageId,
            }
            note_ref = db.collection("notes").document(target_id)
            batch.set(note_ref, note_data)
            notes.append(_note(target_id, note_data))
        else:
            checkpoint_data = {
                "uid": uid,
                "title": item.title,
                "details": item.content,
                "completed": False,
                "sourceConversationId": conversation_id,
                "sourceMessageId": payload.sourceMessageId,
                "createdAt": item_time,
                "completedAt": None,
            }
            checkpoint_ref = db.collection("checkpoints").document(target_id)
            batch.set(checkpoint_ref, checkpoint_data)
            checkpoints.append(_checkpoint(target_id, checkpoint_data))

    batch.set(
        batch_ref,
        {
            "uid": uid,
            "conversationId": conversation_id,
            "sourceMessageId": payload.sourceMessageId,
            "noteIds": [note.id for note in notes],
            "checkpointIds": [checkpoint.id for checkpoint in checkpoints],
            "createdAt": now,
        },
    )
    batch.commit()
    return CaptureItemsResponse(notes=notes, checkpoints=checkpoints)


def _capture_response_from_ids(db: Any, data: dict[str, Any], uid: str) -> CaptureItemsResponse:
    notes = []
    for note_id in data.get("noteIds", []):
        snapshot = db.collection("notes").document(note_id).get()
        if snapshot.exists and snapshot.to_dict().get("uid") == uid:
            notes.append(_note(note_id, snapshot.to_dict()))
    checkpoints = []
    for checkpoint_id in data.get("checkpointIds", []):
        snapshot = db.collection("checkpoints").document(checkpoint_id).get()
        if snapshot.exists and snapshot.to_dict().get("uid") == uid:
            checkpoints.append(_checkpoint(checkpoint_id, snapshot.to_dict()))
    return CaptureItemsResponse(notes=notes, checkpoints=checkpoints)


def _conversation_with_messages(
    db: Any,
    conversation_id: str,
    uid: str,
) -> tuple[dict[str, Any], list[ConversationMessageOut]]:
    conversation = _owned_conversation(db, conversation_id, uid)
    return conversation, _conversation_messages(db, conversation_id, uid)


def _owned_conversation(db: Any, conversation_id: str, uid: str) -> dict[str, Any]:
    if not conversation_id or "/" in conversation_id:
        raise _not_found()
    snapshot = db.collection("conversations").document(conversation_id).get()
    if not snapshot.exists or snapshot.to_dict().get("uid") != uid:
        raise _not_found()
    return snapshot.to_dict()


def _conversation_messages(
    db: Any,
    conversation_id: str,
    uid: str,
) -> list[ConversationMessageOut]:
    snapshots = list(
        db.collection("conversation_messages")
        .where(filter=FieldFilter("uid", "==", uid))
        .where(filter=FieldFilter("conversationId", "==", conversation_id))
        .order_by("createdAt")
        .limit(MAX_MESSAGES)
        .stream()
    )
    messages = [_message(snapshot.id, snapshot.to_dict()) for snapshot in snapshots]
    messages.sort(key=lambda item: (item.createdAt, item.id))
    return messages


def _branch_to(
    messages: list[ConversationMessageOut],
    target_id: str,
) -> list[ConversationMessageOut]:
    by_id = {message.id: message for message in messages}
    current = by_id.get(target_id)
    if current is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    reverse_path = []
    seen = set()
    while current is not None and len(reverse_path) < MAX_CONTEXT_MESSAGES:
        if current.id in seen:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Conversation graph is invalid")
        seen.add(current.id)
        reverse_path.append(current)
        current = by_id.get(current.parentId) if current.parentId else None
    return list(reversed(reverse_path))


def _request_exists(
    db: Any,
    conversation_id: str,
    uid: str,
    request_id: str,
) -> bool:
    message_id = _stable_id("message", conversation_id, request_id, "user")
    snapshot = db.collection("conversation_messages").document(message_id).get()
    if not snapshot.exists:
        return False
    data = snapshot.to_dict()
    return data.get("uid") == uid and data.get("conversationId") == conversation_id


def _conversation_for_request(
    db: Any,
    uid: str,
    request_id: str,
) -> tuple[str, dict[str, Any]] | None:
    conversation_id = _stable_id("conversation", uid, request_id)
    snapshot = db.collection("conversations").document(conversation_id).get()
    if not snapshot.exists or snapshot.to_dict().get("uid") != uid:
        return None
    return conversation_id, snapshot.to_dict()


def _stable_id(*parts: str) -> str:
    return sha256(":".join(parts).encode("utf-8")).hexdigest()


def _detail(db: Any, conversation_id: str, data: dict[str, Any]) -> ConversationDetail:
    return _detail_from_messages(
        conversation_id,
        data,
        _conversation_messages(db, conversation_id, data["uid"]),
    )


def _detail_from_messages(
    conversation_id: str,
    data: dict[str, Any],
    messages: list[ConversationMessageOut],
) -> ConversationDetail:
    summary = _summary(conversation_id, {**data, "messageCount": len(messages)})
    return ConversationDetail(**summary.model_dump(), messages=messages)


def _summary(conversation_id: str, data: dict[str, Any]) -> ConversationSummary:
    return ConversationSummary(
        id=conversation_id,
        title=data.get("title") or "Untitled conversation",
        createdAt=_milliseconds(data.get("createdAt")),
        updatedAt=_milliseconds(data.get("updatedAt")),
        messageCount=int(data.get("messageCount", 0)),
    )


def _message(message_id: str, data: dict[str, Any]) -> ConversationMessageOut:
    return ConversationMessageOut(
        id=message_id,
        parentId=data.get("parentId"),
        role=data.get("role", "assistant"),
        content=data.get("content", ""),
        createdAt=_milliseconds(data.get("createdAt")),
    )


def _note(note_id: str, data: dict[str, Any]) -> NoteOut:
    return NoteOut(
        id=note_id,
        text=data.get("text", ""),
        tags=data.get("tags", []),
        createdAt=_milliseconds(data.get("createdAt")),
        updatedAt=_milliseconds(data.get("updatedAt")) or None,
    )


def _checkpoint(checkpoint_id: str, data: dict[str, Any]) -> CheckpointOut:
    return CheckpointOut(
        id=checkpoint_id,
        title=data.get("title", ""),
        details=data.get("details", ""),
        completed=bool(data.get("completed", False)),
        sourceConversationId=data.get("sourceConversationId", ""),
        sourceMessageId=data.get("sourceMessageId", ""),
        createdAt=_milliseconds(data.get("createdAt")),
        completedAt=_milliseconds(data.get("completedAt")) or None,
    )


def _conversation_title(text: str) -> str:
    first_line = next((line.strip() for line in text.splitlines() if line.strip()), text.strip())
    clean = re.sub(r"^[#>*_`\-\s]+", "", first_line).strip()
    return (clean or "New conversation")[:80]


def _captured_note_text(item: CaptureItem) -> str:
    return f"# {item.title}\n\n{item.content}".strip()


def _milliseconds(value: object) -> int:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(value)
    if hasattr(value, "timestamp"):
        return int(value.timestamp() * 1000)
    return 0


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")


def _storage_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Conversation workspace is temporarily unavailable. Please try again.",
    )
