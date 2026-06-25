import time

from fastapi import APIRouter, Depends, HTTPException, status

from ..dependencies import get_current_uid
from ..firebase import get_firestore_client
from ..schemas import CreateNoteResponse, DeleteNoteResponse, NoteCreate, NoteOut, NotesResponse


router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("", response_model=NotesResponse)
def list_notes(uid: str = Depends(get_current_uid)):
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
        notes.append(
            NoteOut(
                id=doc.id,
                text=data.get("text", ""),
                createdAt=data.get("createdAt", 0),
            )
        )

    notes.sort(key=lambda note: note.createdAt, reverse=True)
    return NotesResponse(notes=notes)


@router.post("", response_model=CreateNoteResponse, status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, uid: str = Depends(get_current_uid)):
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
        "createdAt": int(time.time() * 1000),
    }
    _, doc_ref = db.collection("notes").add(note_data)

    return CreateNoteResponse(
        note=NoteOut(
            id=doc_ref.id,
            text=note_data["text"],
            createdAt=note_data["createdAt"],
        )
    )


@router.delete("/{note_id}", response_model=DeleteNoteResponse)
def delete_note(note_id: str, uid: str = Depends(get_current_uid)):
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
