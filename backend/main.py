"""
GreatUniHack Demo - FastAPI Backend
-----------------------------------
Handles Firebase authentication + Firestore CRUD + CORS configuration.
"""

from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.responses import FileResponse, Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
import time
import logging
import firebase_admin
from firebase_admin import credentials, auth, firestore
from dotenv import load_dotenv

# ------------------------------------------------------------------------------
# 1. 环境变量加载 (.env)
# ------------------------------------------------------------------------------
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GreatUniHackBackend")

# ------------------------------------------------------------------------------
# 2. 初始化 Firebase (自动检测路径)
# ------------------------------------------------------------------------------
def init_firebase():
    """Initialize Firebase Admin SDK with flexible path detection."""
    if firebase_admin._apps:
        return firestore.client()

    # 当前运行目录（修复 uvicorn reload cwd 错位问题）
    cwd = os.getcwd()
    file_dir = os.path.dirname(os.path.abspath(__file__))

    # 优先读取环境变量（如果 .env 中配置了）
    env_path = os.getenv("FIREBASE_CREDENTIALS_PATH")

    # 合法的默认候选路径（支持两种启动方式）
    candidates = []
    if env_path:
        candidates.append(env_path)
    candidates.append(os.path.join(file_dir, "serviceAccountKey.json"))   # backend 下运行
    candidates.append(os.path.join(cwd, "backend", "serviceAccountKey.json"))  # 项目根运行
    candidates.append(os.path.join(cwd, "serviceAccountKey.json"))  # 万一手动放在 cwd

    # 选出第一个存在的路径
    cred_path = next((p for p in candidates if os.path.exists(p)), None)

    if not cred_path:
        raise RuntimeError(
            "❌ Firebase service account JSON not found.\n"
            f"Tried paths:\n - " + "\n - ".join(candidates) +
            "\n👉 Place 'serviceAccountKey.json' in backend/, "
            "or set FIREBASE_CREDENTIALS_PATH in .env."
        )

    logger.info(f"✅ Initializing Firebase from: {cred_path}")
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)
    return firestore.client()


# Firestore client
db = init_firebase()

# ------------------------------------------------------------------------------
# 3. 初始化 FastAPI
# ------------------------------------------------------------------------------
app = FastAPI(title="GreatUniHack Demo API", version="1.0")

# ✅ CORS 配置：允许前端（Vite）访问
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------------------
# 4. 数据模型
# ------------------------------------------------------------------------------
class NoteIn(BaseModel):
    text: str

# ------------------------------------------------------------------------------
# 5. Firebase token 认证逻辑
# ------------------------------------------------------------------------------
def get_current_uid(authorization: Optional[str] = Header(default=None)) -> str:
    """从 Authorization header 验证 Firebase ID Token"""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        decoded = auth.verify_id_token(token)
        return decoded["uid"]
    except Exception as e:
        logger.warning(f"Invalid Firebase token: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

# ------------------------------------------------------------------------------
# 6. 路由定义
# ------------------------------------------------------------------------------
@app.get("/")
def root():
    """API 状态检测"""
    return {"ok": True, "message": "🚀 Backend running successfully!"}


@app.get("/favicon.ico")
def favicon():
    """静态 favicon 处理"""
    here = os.path.dirname(__file__)
    path = os.path.join(here, "static", "favicon.ico")
    if os.path.exists(path):
        return FileResponse(path)
    return Response(status_code=204)


@app.get("/notes")
def list_notes(uid: str = Depends(get_current_uid)):
    """获取当前用户的所有笔记"""
    try:
        docs = db.collection("notes").where("uid", "==", uid).order_by("createdAt").stream()
        notes = [{"id": d.id, **d.to_dict()} for d in docs]
        notes.sort(key=lambda x: x.get("createdAt", 0), reverse=True)
        return {"notes": notes}
    except Exception as e:
        logger.error(f"Failed to fetch notes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/notes")
def create_note(payload: NoteIn, uid: str = Depends(get_current_uid)):
    """创建新笔记"""
    try:
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


@app.get("/test")
def test_db():
    """测试 Firestore 连接"""
    try:
        docs = db.collection("notes").limit(1).stream()
        test_note = next(docs, None)
        msg = "Firestore connected ✅" if test_note else "Firestore empty but connected ✅"
        return {"ok": True, "message": msg}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


# ------------------------------------------------------------------------------
# 启动命令（仅调试时用）
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
