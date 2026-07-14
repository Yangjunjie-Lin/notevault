import logging
import time
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from google.api_core.exceptions import GoogleAPICallError

from ..firebase import get_firestore_client
from ..rate_limit import read_limited_uid, write_limited_uid
from ..schemas import CreateNoteResponse, DeleteNoteResponse, NoteCreate, NoteOut, NotesResponse


router = APIRouter(prefix="/notes", tags=["notes"])
logger = logging.getLogger(__name__)


@router.get("", response_model=NotesResponse)
def list_notes(
    q: Annotated[str | None, Query(max_length=100)] = None,
    tag: Annotated[str | None, Query(max_length=32)] = None,
    uid: str = Depends(read_limited_uid),
):
    db = get_firestore_client()
    try:
        # Query only by owner so Firestore can use its automatic single-field
        # index. Ordering is applied below and does not require a composite
        # uid + createdAt index in every deployment.
        docs = db.collection("notes").where("uid", "==", uid).stream()

        notes = []
        for doc in docs:
            data = doc.to_dict()
            note = NoteOut(
                id=doc.id,
                text=data.get("text", ""),
                tags=data.get("tags", []),
                createdAt=_created_at_milliseconds(data.get("createdAt")),
            )
            if _matches_filters(note=note, q=q, tag=tag):
                notes.append(note)
    except GoogleAPICallError as exc:
        logger.exception("Firestore failed while listing notes")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Notes are temporarily unavailable. Please try again.",
        ) from exc

    notes.sort(key=lambda note: note.createdAt, reverse=True)
    return NotesResponse(notes=notes)


@router.post("", response_model=CreateNoteResponse, status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, uid: str = Depends(write_limited_uid)):
    text = payload.text.strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Note text cannot be empty",
        )

    db = get_firestore_client()
    note_data = {
        "uid": uid,
        "text": text,
        "tags": payload.tags,
        "createdAt": int(time.time() * 1000),
    }
    _, doc_ref = db.collection("notes").add(note_data)

    return CreateNoteResponse(
        note=NoteOut(
            id=doc_ref.id,
            text=note_data["text"],
            tags=note_data["tags"],
            createdAt=note_data["createdAt"],
        )
    )


@router.delete("/{note_id}", response_model=DeleteNoteResponse)
def delete_note(note_id: str, uid: str = Depends(write_limited_uid)):
    db = get_firestore_client()
    doc_ref = db.collection("notes").document(note_id)
    snapshot = doc_ref.get()

    if not snapshot.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    note = snapshot.to_dict()
    if note.get("uid") != uid:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    doc_ref.delete()
    return DeleteNoteResponse(ok=True)


def _matches_filters(note: NoteOut, q: str | None, tag: str | None) -> bool:
    if q:
        needle = q.strip().lower()
        searchable_text = f"{note.text} {' '.join(note.tags)}".lower()
        if needle and needle not in searchable_text:
            return False

    if tag:
        clean_tag = tag.strip().lower()
        if clean_tag and clean_tag not in note.tags:
            return False

    return True


def _created_at_milliseconds(value: object) -> int:
    """Normalize current millisecond values and legacy Firestore timestamps."""
    if isinstance(value, datetime):
        return int(value.timestamp() * 1000)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(value)
    return 0
