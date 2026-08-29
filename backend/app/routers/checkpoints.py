"""User-confirmed action checkpoints captured from conversations."""

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, status
from google.api_core.exceptions import GoogleAPICallError
from google.cloud.firestore_v1 import Query as FirestoreQuery
from google.cloud.firestore_v1.base_query import FieldFilter

from ..firebase import get_firestore_client
from ..rate_limit import read_limited_uid, write_limited_uid
from ..schemas import (
    CheckpointOut,
    CheckpointsResponse,
    CheckpointUpdate,
    UpdateCheckpointResponse,
)


router = APIRouter(prefix="/checkpoints", tags=["checkpoints"])
logger = logging.getLogger(__name__)


@router.get("", response_model=CheckpointsResponse)
def list_checkpoints(uid: str = Depends(read_limited_uid)) -> CheckpointsResponse:
    try:
        snapshots = list(
            get_firestore_client()
            .collection("checkpoints")
            .where(filter=FieldFilter("uid", "==", uid))
            .order_by("createdAt", direction=FirestoreQuery.DESCENDING)
            .limit(100)
            .stream()
        )
        return CheckpointsResponse(
            checkpoints=[_checkpoint(snapshot.id, snapshot.to_dict()) for snapshot in snapshots]
        )
    except GoogleAPICallError as exc:
        logger.exception("Firestore failed while listing checkpoints")
        raise _unavailable() from exc


@router.patch("/{checkpoint_id}", response_model=UpdateCheckpointResponse)
def update_checkpoint(
    checkpoint_id: str,
    payload: CheckpointUpdate,
    uid: str = Depends(write_limited_uid),
) -> UpdateCheckpointResponse:
    if not checkpoint_id or "/" in checkpoint_id:
        raise _not_found()
    try:
        document = get_firestore_client().collection("checkpoints").document(checkpoint_id)
        snapshot = document.get()
        if not snapshot.exists or snapshot.to_dict().get("uid") != uid:
            raise _not_found()
        data = snapshot.to_dict()
        completed_at = int(time.time() * 1000) if payload.completed else None
        changes = {"completed": payload.completed, "completedAt": completed_at}
        document.update(changes)
        return UpdateCheckpointResponse(
            checkpoint=_checkpoint(checkpoint_id, {**data, **changes})
        )
    except HTTPException:
        raise
    except GoogleAPICallError as exc:
        logger.exception("Firestore failed while updating a checkpoint")
        raise _unavailable() from exc


def _checkpoint(checkpoint_id: str, data: dict) -> CheckpointOut:
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


def _milliseconds(value: object) -> int:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(value)
    if hasattr(value, "timestamp"):
        return int(value.timestamp() * 1000)
    return 0


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checkpoint not found")


def _unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Checkpoints are temporarily unavailable. Please try again.",
    )
