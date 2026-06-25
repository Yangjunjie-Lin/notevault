from pydantic import BaseModel, Field


class NoteCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)


class NoteOut(BaseModel):
    id: str
    text: str
    createdAt: int


class NotesResponse(BaseModel):
    notes: list[NoteOut]


class CreateNoteResponse(BaseModel):
    note: NoteOut


class DeleteNoteResponse(BaseModel):
    ok: bool

