"""Test-only FastAPI process used by Playwright.

This module is never imported by the production entrypoint. It overrides auth
and Firestore only inside the dedicated E2E server process.
"""

from app.dependencies import get_current_uid
from app.main import app
from app.rate_limit import read_notes_limiter, write_notes_limiter
from app.routers import notes as notes_router
from app.routers import conversations as conversations_router
from app.routers import checkpoints as checkpoints_router
from app.ai.client import Completion
from app.ai.service import get_ai_service
from app.schemas import AiSuggestionEnvelope, AiSuggestionItem
from tests.conftest import FakeFirestore
from pydantic import BaseModel, Field


database = FakeFirestore()
read_notes_limiter.reset()
write_notes_limiter.reset()
app.dependency_overrides[get_current_uid] = lambda: "e2e-user"
notes_router.get_firestore_client = lambda: database
conversations_router.get_firestore_client = lambda: database
checkpoints_router.get_firestore_client = lambda: database


class E2EAiService:
    model_name = "deepseek-ai/DeepSeek-V4-Flash"

    async def chat(self, history, text):
        prefix = "Branch reply" if history else "Canvas reply"
        return Completion(
            content=f"## {prefix}\n\nI mapped your idea: **{text}**",
            trace_id="e2e-conversation",
        )

    async def suggest_captures(self, transcript, intent):
        candidates = []
        if intent in {"both", "notes"}:
            candidates.append(AiSuggestionItem(
                kind="note",
                title="Conversation insight",
                content="A concise insight reviewed from this branch.",
            ))
        if intent in {"both", "checkpoints"}:
            candidates.append(AiSuggestionItem(
                kind="checkpoint",
                title="Review the next step",
                content="Turn the selected branch into a concrete follow-up.",
            ))
        return AiSuggestionEnvelope(items=candidates), "e2e-capture"


app.dependency_overrides[get_ai_service] = lambda: E2EAiService()


class SeedRequest(BaseModel):
    count: int = Field(ge=1, le=100)
    prefix: str = Field(default="seed", min_length=1, max_length=32)
    tag: str = Field(default="pages", min_length=1, max_length=32)


@app.post("/__test__/reset")
def reset_test_database():
    global database
    database = FakeFirestore()
    read_notes_limiter.reset()
    write_notes_limiter.reset()
    notes_router.get_firestore_client = lambda: database
    conversations_router.get_firestore_client = lambda: database
    checkpoints_router.get_firestore_client = lambda: database
    return {"ok": True}


@app.post("/__test__/seed")
def seed_test_database(payload: SeedRequest):
    base_timestamp = 1_780_000_000_000
    ids = []
    for index in range(payload.count):
        note_id = f"{payload.prefix}-{index:03}"
        database.notes.documents[note_id] = {
            "uid": "e2e-user",
            "text": f"Pagination seed {index:02}",
            "tags": [payload.tag],
            "createdAt": base_timestamp + index,
        }
        ids.append(note_id)
    return {"ids": ids}
