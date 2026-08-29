from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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


class ConversationStartRequest(AiTextRequest):
    clientRequestId: str = Field(..., min_length=8, max_length=80)

    @field_validator("clientRequestId")
    @classmethod
    def normalize_request_id(cls, value: str) -> str:
        value = value.strip()
        if not value or "/" in value:
            raise ValueError("Request identifier is invalid")
        return value


class ConversationReplyRequest(AiTextRequest):
    parentId: str = Field(..., min_length=1, max_length=1500)
    clientRequestId: str = Field(..., min_length=8, max_length=80)

    @field_validator("parentId", "clientRequestId")
    @classmethod
    def normalize_conversation_ids(cls, value: str) -> str:
        value = value.strip()
        if not value or "/" in value:
            raise ValueError("Conversation identifiers are invalid")
        return value


class ConversationMessageOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    parentId: str | None = None
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=5000)
    createdAt: int


class ConversationSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str = Field(..., min_length=1, max_length=80)
    createdAt: int
    updatedAt: int
    messageCount: int = Field(..., ge=0, le=500)


class ConversationDetail(ConversationSummary):
    messages: list[ConversationMessageOut]


class ConversationsResponse(BaseModel):
    conversations: list[ConversationSummary]


class DeleteConversationResponse(BaseModel):
    ok: bool


class CaptureSuggestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messageId: str = Field(..., min_length=1, max_length=1500)
    intent: Literal["both", "notes", "checkpoints"] = "both"

    @field_validator("messageId")
    @classmethod
    def normalize_message_id(cls, value: str) -> str:
        value = value.strip()
        if not value or "/" in value:
            raise ValueError("Message identifier is invalid")
        return value


class CaptureSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=80)
    kind: Literal["note", "checkpoint"]
    title: str = Field(..., min_length=1, max_length=120)
    content: str = Field(..., min_length=1, max_length=2000)


class CaptureSuggestionsResponse(BaseModel):
    suggestions: list[CaptureSuggestion] = Field(default_factory=list, max_length=12)
    model: str = Field(..., min_length=1)
    traceId: str | None = Field(default=None, max_length=128)


class CaptureItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["note", "checkpoint"]
    title: str = Field(..., min_length=1, max_length=120)
    content: str = Field(..., min_length=1, max_length=2000)

    @field_validator("title", "content")
    @classmethod
    def normalize_capture_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Capture content must not be blank")
        return value


class CaptureItemsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceMessageId: str = Field(..., min_length=1, max_length=1500)
    clientRequestId: str = Field(..., min_length=8, max_length=80)
    items: list[CaptureItem] = Field(..., min_length=1, max_length=12)

    @field_validator("sourceMessageId", "clientRequestId")
    @classmethod
    def normalize_capture_ids(cls, value: str) -> str:
        value = value.strip()
        if not value or "/" in value:
            raise ValueError("Capture identifiers are invalid")
        return value


class CheckpointOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    details: str
    completed: bool
    sourceConversationId: str
    sourceMessageId: str
    createdAt: int
    completedAt: int | None = None


class CaptureItemsResponse(BaseModel):
    notes: list[NoteOut] = Field(default_factory=list)
    checkpoints: list[CheckpointOut] = Field(default_factory=list)


class CheckpointsResponse(BaseModel):
    checkpoints: list[CheckpointOut]


class CheckpointUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    completed: bool


class UpdateCheckpointResponse(BaseModel):
    checkpoint: CheckpointOut


class AiSuggestionItem(BaseModel):
    """Internal provider-output contract; never accepted directly from clients."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["note", "checkpoint"]
    title: str = Field(..., min_length=1, max_length=120)
    content: str = Field(..., min_length=1, max_length=2000)

    @field_validator("title", "content")
    @classmethod
    def trim_suggestion_text(cls, value: str) -> str:
        return value.strip()


class AiSuggestionEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[AiSuggestionItem] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def require_unique_useful_items(self):
        seen: set[tuple[str, str]] = set()
        unique = []
        for item in self.items:
            key = (item.kind, item.title.casefold())
            if key not in seen:
                seen.add(key)
                unique.append(item)
        self.items = unique
        return self
