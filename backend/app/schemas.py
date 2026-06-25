from pydantic import BaseModel, Field, field_validator


class NoteCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    tags: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("text")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[str]) -> list[str]:
        normalized = []
        seen = set()

        for tag in value:
            clean_tag = tag.strip().lower()
            if not clean_tag or clean_tag in seen:
                continue
            if len(clean_tag) > 32:
                raise ValueError("Tags must be 32 characters or fewer")
            normalized.append(clean_tag)
            seen.add(clean_tag)

        return normalized


class NoteOut(BaseModel):
    id: str
    text: str
    tags: list[str] = Field(default_factory=list)
    createdAt: int


class NotesResponse(BaseModel):
    notes: list[NoteOut]


class CreateNoteResponse(BaseModel):
    note: NoteOut


class DeleteNoteResponse(BaseModel):
    ok: bool
