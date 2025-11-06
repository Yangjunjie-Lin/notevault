"""
Firebase 初始化模块
"""
import os
import json
import logging
import firebase_admin
from firebase_admin import credentials, auth, firestore

logger = logging.getLogger(__name__)

_db = None

def get_firestore():
    """获取 Firestore 客户端（单例模式）"""
    global _db
    
    if _db is not None:
        return _db
    
    if not firebase_admin._apps:
        # 优先从环境变量读取 JSON 字符串
        firebase_creds_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
        
        if firebase_creds_json:
            try:
                cred_dict = json.loads(firebase_creds_json)
                logger.info("✅ Initializing Firebase from FIREBASE_CREDENTIALS_JSON")
                cred = credentials.Certificate(cred_dict)
                firebase_admin.initialize_app(cred)
            except json.JSONDecodeError as e:
                logger.error(f"❌ Failed to parse FIREBASE_CREDENTIALS_JSON: {e}")
                raise RuntimeError("Invalid FIREBASE_CREDENTIALS_JSON format")
        else:
            # 本地开发时从文件读取
            cred_path = os.path.join(os.path.dirname(__file__), "..", "serviceAccountKey.json")
            if os.path.exists(cred_path):
                logger.info(f"✅ Initializing Firebase from file: {cred_path}")
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
            else:
                raise RuntimeError(
                    "❌ Firebase credentials not found. "
                    "Set FIREBASE_CREDENTIALS_JSON environment variable or "
                    "place serviceAccountKey.json in project root."
                )
    
    _db = firestore.client()
    return _db

def verify_token(token: str) -> dict:
    """验证 Firebase ID Token"""
    try:
        decoded = auth.verify_id_token(token)
        return decoded
    except Exception as e:
        logger.warning(f"Invalid Firebase token: {e}")
        raise Exception(f"Invalid token: {e}")
