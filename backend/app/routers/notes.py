import logging
import time
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from google.api_core.exceptions import GoogleAPICallError
from google.cloud.firestore_v1 import Query as FirestoreQuery

from ..cursor import decode_cursor, encode_cursor, filter_fingerprint
from ..firebase import get_firestore_client
from ..rate_limit import read_limited_uid, write_limited_uid
from ..schemas import (
    CreateNoteResponse,
    DeleteNoteResponse,
    NoteCreate,
    NoteOut,
    NotesResponse,
    NoteUpdate,
    UpdateNoteResponse,
)


router = APIRouter(prefix="/notes", tags=["notes"])
logger = logging.getLogger(__name__)
DEFAULT_LIMIT = 20
MAX_LIMIT = 50
SEARCH_SCAN_LIMIT = 200


@router.get("", response_model=NotesResponse)
def list_notes(
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    cursor: Annotated[str | None, Query(max_length=2048)] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    tag: Annotated[str | None, Query(max_length=32)] = None,
    uid: str = Depends(read_limited_uid),
):
    clean_q = (q or "").strip()
    clean_tag = (tag or "").strip().lower()
    try:
        if clean_q or clean_tag:
            return _list_filtered_notes(
                uid=uid,
                limit=limit,
                cursor=cursor,
                q=clean_q,
                tag=clean_tag,
            )
        return _list_paginated_notes(uid=uid, limit=limit, cursor=cursor)
    except HTTPException:
        raise
    except GoogleAPICallError as exc:
        logger.exception("Firestore failed while listing notes")
        raise _firestore_unavailable() from exc


@router.post("", response_model=CreateNoteResponse, status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, uid: str = Depends(write_limited_uid)):
    text = _require_text(payload.text)
    now = int(time.time() * 1000)
    note_data = {
        "uid": uid,
        "text": text,
        "tags": payload.tags,
        "createdAt": now,
    }

    try:
        _, doc_ref = get_firestore_client().collection("notes").add(note_data)
    except GoogleAPICallError as exc:
        logger.exception("Firestore failed while creating a note")
        raise _firestore_unavailable() from exc

    return CreateNoteResponse(note=_note_out(doc_ref.id, note_data))


@router.patch("/{note_id}", response_model=UpdateNoteResponse)
def update_note(
    note_id: str,
    payload: NoteUpdate,
    uid: str = Depends(write_limited_uid),
):
    text = _require_text(payload.text)
    db = get_firestore_client()
    doc_ref = db.collection("notes").document(note_id)

    try:
        snapshot = doc_ref.get()
        if not snapshot.exists or snapshot.to_dict().get("uid") != uid:
            raise _not_found()

        original = snapshot.to_dict()
        updated_at = int(time.time() * 1000)
        changes = {"text": text, "tags": payload.tags, "updatedAt": updated_at}
        doc_ref.update(changes)
    except HTTPException:
        raise
    except GoogleAPICallError as exc:
        logger.exception("Firestore failed while updating a note")
        raise _firestore_unavailable() from exc

    return UpdateNoteResponse(
        note=_note_out(note_id, {**original, **changes})
    )


@router.delete("/{note_id}", response_model=DeleteNoteResponse)
def delete_note(note_id: str, uid: str = Depends(write_limited_uid)):
    doc_ref = get_firestore_client().collection("notes").document(note_id)
    try:
        snapshot = doc_ref.get()
        if not snapshot.exists or snapshot.to_dict().get("uid") != uid:
            raise _not_found()
        doc_ref.delete()
    except HTTPException:
        raise
    except GoogleAPICallError as exc:
        logger.exception("Firestore failed while deleting a note")
        raise _firestore_unavailable() from exc

    return DeleteNoteResponse(ok=True)


def _list_paginated_notes(
    *, uid: str, limit: int, cursor: str | None
) -> NotesResponse:
    collection = get_firestore_client().collection("notes")
    query = _ordered_owner_query(collection, uid)

    if cursor:
        payload = _validated_cursor(cursor, uid=uid, mode="page", q=None, tag=None)
        snapshot = collection.document(payload.get("id", "")).get()
        if (
            not snapshot.exists
            or snapshot.to_dict().get("uid") != uid
            or _created_at_milliseconds(snapshot.to_dict().get("createdAt"))
            != payload.get("createdAt")
        ):
            raise _invalid_cursor()
        query = query.start_after(snapshot)

    snapshots = list(query.limit(limit + 1).stream())
    has_more = len(snapshots) > limit
    page = snapshots[:limit]
    notes = [_note_out(snapshot.id, snapshot.to_dict()) for snapshot in page]
    next_cursor = None
    if has_more and notes:
        last = notes[-1]
        next_cursor = encode_cursor(
            {
                "v": 1,
                "mode": "page",
                "uid": uid,
                "fp": filter_fingerprint(None, None),
                "id": last.id,
                "createdAt": last.createdAt,
            }
        )

    return NotesResponse(notes=notes, nextCursor=next_cursor, hasMore=has_more)


def _list_filtered_notes(
    *, uid: str, limit: int, cursor: str | None, q: str, tag: str
) -> NotesResponse:
    offset = 0
    if cursor:
        payload = _validated_cursor(cursor, uid=uid, mode="search", q=q, tag=tag)
        offset = payload.get("offset")
        if not isinstance(offset, int) or offset < 0 or offset > SEARCH_SCAN_LIMIT:
            raise _invalid_cursor()

    collection = get_firestore_client().collection("notes")
    snapshots = list(
        _ordered_owner_query(collection, uid).limit(SEARCH_SCAN_LIMIT + 1).stream()
    )
    search_limited = len(snapshots) > SEARCH_SCAN_LIMIT
    candidates = [
        _note_out(snapshot.id, snapshot.to_dict())
        for snapshot in snapshots[:SEARCH_SCAN_LIMIT]
    ]
    candidates.sort(key=lambda note: (note.createdAt, note.id), reverse=True)
    matches = [note for note in candidates if _matches_filters(note, q=q, tag=tag)]

    page = matches[offset : offset + limit]
    next_offset = offset + len(page)
    has_more = next_offset < len(matches)
    next_cursor = None
    if has_more:
        next_cursor = encode_cursor(
            {
                "v": 1,
                "mode": "search",
                "uid": uid,
                "fp": filter_fingerprint(q, tag),
                "offset": next_offset,
            }
        )

    return NotesResponse(
        notes=page,
        nextCursor=next_cursor,
        hasMore=has_more,
        searchLimited=search_limited,
    )


def _ordered_owner_query(collection: Any, uid: str):
    return (
        collection.where("uid", "==", uid)
        .order_by("createdAt", direction=FirestoreQuery.DESCENDING)
        .order_by("__name__", direction=FirestoreQuery.DESCENDING)
    )


def _validated_cursor(
    cursor: str,
    *,
    uid: str,
    mode: str,
    q: str | None,
    tag: str | None,
) -> dict[str, Any]:
    payload = decode_cursor(cursor)
    if (
        payload.get("uid") != uid
        or payload.get("mode") != mode
        or payload.get("fp") != filter_fingerprint(q, tag)
    ):
        raise _invalid_cursor()
    return payload


def _matches_filters(note: NoteOut, q: str | None, tag: str | None) -> bool:
    if q:
        searchable_text = f"{note.text} {' '.join(note.tags)}".lower()
        if q.strip().lower() not in searchable_text:
            return False
    if tag and tag.strip().lower() not in note.tags:
        return False
    return True


def _note_out(note_id: str, data: dict[str, Any]) -> NoteOut:
    updated_at = _created_at_milliseconds(data.get("updatedAt"))
    return NoteOut(
        id=note_id,
        text=data.get("text", ""),
        tags=data.get("tags", []),
        createdAt=_created_at_milliseconds(data.get("createdAt")),
        updatedAt=updated_at or None,
    )


def _require_text(value: str) -> str:
    text = value.strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Note text cannot be empty",
        )
    return text


def _created_at_milliseconds(value: object) -> int:
    """Normalize current millisecond values and legacy Firestore timestamps."""
    if isinstance(value, datetime):
        return int(value.timestamp() * 1000)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(value)
    return 0


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")


def _invalid_cursor() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired notes cursor",
    )


def _firestore_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Notes are temporarily unavailable. Please try again.",
    )
