"""
Vercel Serverless Function - Main API Entry
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
import os

# 创建 FastAPI 应用
app = FastAPI(title="Personal Notebook API", version="1.0")

# CORS 配置
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if "*" in allowed_origins else [origin.strip() for origin in allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 导入路由
from .routes import notes, auth

# 注册路由
app.include_router(notes.router, prefix="/api")
app.include_router(auth.router, prefix="/api")

@app.get("/api")
@app.get("/api/")
def root():
    """API 状态检测"""
    return {"ok": True, "message": "🚀 Backend running on Vercel!"}

# Vercel serverless handler
handler = Mangum(app, lifespan="off")
