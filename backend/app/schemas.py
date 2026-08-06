from pydantic import BaseModel, ConfigDict, Field, field_validator


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    detail: str


class AiTextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(..., min_length=1, max_length=5000)

    @field_validator("text")
    @classmethod
    def require_nonempty_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Text must not be blank")
        return value


class AiRevisionRequest(AiTextRequest):
    instruction: str = Field(..., min_length=1, max_length=1000)

    @field_validator("instruction")
    @classmethod
    def require_nonempty_instruction(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Instruction must not be blank")
        return value


class AiFormatResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    text: str = Field(..., min_length=1, max_length=5000)
    changed: bool
    model: str = Field(..., min_length=1)
    trace_id: str | None = Field(default=None, alias="traceId", max_length=128)


class AiRevisionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    text: str = Field(..., min_length=1, max_length=5000)
    model: str = Field(..., min_length=1)
    trace_id: str | None = Field(default=None, alias="traceId", max_length=128)


class NoteWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

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


class NoteCreate(NoteWrite):
    pass


class NoteUpdate(NoteWrite):
    pass


class NoteOut(BaseModel):
    id: str
    text: str
    tags: list[str] = Field(default_factory=list)
    createdAt: int
    updatedAt: int | None = None


class NotesResponse(BaseModel):
    notes: list[NoteOut]
    nextCursor: str | None = None
    hasMore: bool = False
    searchLimited: bool = False


class CreateNoteResponse(BaseModel):
    note: NoteOut


class UpdateNoteResponse(BaseModel):
    note: NoteOut


class DeleteNoteResponse(BaseModel):
    ok: bool
