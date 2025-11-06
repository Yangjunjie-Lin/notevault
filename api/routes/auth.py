"""
认证和测试相关 API 路由
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse
import logging

from ..firebase_config import get_firestore

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/test")
def test_db():
    """测试 Firestore 连接"""
    try:
        db = get_firestore()
        docs = db.collection("notes").limit(1).stream()
        test_note = next(docs, None)
        msg = "Firestore connected ✅" if test_note else "Firestore empty but connected ✅"
        return {"ok": True, "message": msg}
    except Exception as e:
        logger.error(f"Firestore test failed: {e}")
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})
