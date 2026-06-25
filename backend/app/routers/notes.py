import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..firebase import get_firestore_client
from ..rate_limit import read_limited_uid, write_limited_uid
from ..schemas import CreateNoteResponse, DeleteNoteResponse, NoteCreate, NoteOut, NotesResponse


router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("", response_model=NotesResponse)
def list_notes(
    q: Annotated[str | None, Query(max_length=100)] = None,
    tag: Annotated[str | None, Query(max_length=32)] = None,
    uid: str = Depends(read_limited_uid),
):
    db = get_firestore_client()
    docs = (
        db.collection("notes")
        .where("uid", "==", uid)
        .order_by("createdAt")
        .stream()
    )

    notes = []
    for doc in docs:
        data = doc.to_dict()
        note = NoteOut(
            id=doc.id,
            text=data.get("text", ""),
            tags=data.get("tags", []),
            createdAt=data.get("createdAt", 0),
        )
        if _matches_filters(note=note, q=q, tag=tag):
            notes.append(note)

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
