"""
笔记相关 API 路由
"""
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from typing import Optional
import time
import logging

from ..firebase_config import get_firestore, verify_token

logger = logging.getLogger(__name__)
router = APIRouter()

class NoteIn(BaseModel):
    text: str

def get_current_uid(authorization: Optional[str] = Header(default=None)) -> str:
    """从 Authorization header 验证 Firebase ID Token"""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    
    token = authorization.split(" ", 1)[1]
    try:
        decoded = verify_token(token)
        return decoded["uid"]
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

@router.get("/notes")
def list_notes(uid: str = Depends(get_current_uid)):
    """获取当前用户的所有笔记"""
    try:
        db = get_firestore()
        docs = db.collection("notes").where("uid", "==", uid).order_by("createdAt").stream()
        notes = [{"id": d.id, **d.to_dict()} for d in docs]
        notes.sort(key=lambda x: x.get("createdAt", 0), reverse=True)
        return {"notes": notes}
    except Exception as e:
        logger.error(f"Failed to fetch notes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/notes")
def create_note(payload: NoteIn, uid: str = Depends(get_current_uid)):
    """创建新笔记"""
    try:
        db = get_firestore()
        doc = {
            "uid": uid,
            "text": payload.text,
            "createdAt": int(time.time() * 1000)
        }
        ref = db.collection("notes").add(doc)[1]
        return {"id": ref.id, "ok": True}
    except Exception as e:
        logger.error(f"Failed to create note: {e}")
        raise HTTPException(status_code=500, detail=str(e))
