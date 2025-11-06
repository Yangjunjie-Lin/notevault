# 🚀 Vercel 全栈部署指南

本项目已完全配置为可在 **Vercel** 上部署的全栈应用。前端使用 Vite + React，后端使用 Vercel Serverless Functions (FastAPI)。

---

## 📁 项目结构

```
personal-notebook-app/
├── api/                      # Vercel Serverless Functions (后端)
│   ├── index.py             # FastAPI 主入口
│   ├── firebase_config.py   # Firebase 初始化
│   └── routes/              # API 路由
│       ├── notes.py         # 笔记 CRUD
│       └── auth.py          # 认证和测试
├── src/                      # React 前端源码
│   ├── App.jsx
│   ├── api.js               # API 调用（使用相对路径）
│   ├── firebase.js
│   └── components/
├── index.html               # HTML 入口
├── package.json             # Node 依赖
├── vite.config.js           # Vite 配置
├── vercel.json              # Vercel 配置
└── requirements.txt         # Python 依赖

```

---

## ☁️ 部署到 Vercel（5分钟）

### 步骤 1: 准备 Firebase

1. 访问 [Firebase Console](https://console.firebase.google.com)
2. 创建项目并启用：
   - Firestore Database (Native 模式)
   - Authentication → Google Sign-in
3. 下载服务账号密钥 `serviceAccountKey.json`
4. 获取前端 Firebase 配置

### 步骤 2: 部署到 Vercel

1. 访问 [Vercel.com](https://vercel.com) 并登录
2. 点击 **"New Project"**
3. 导入 GitHub 仓库：`personal-notebook-app`
4. Vercel 自动检测配置（无需修改）
5. 点击 **"Deploy"**

### 步骤 3: 配置环境变量

在 Vercel 项目的 **Settings → Environment Variables** 中添加：

#### Firebase 后端凭证
```env
FIREBASE_CREDENTIALS_JSON={"type":"service_account","project_id":"..."}
```

**获取方法：**
```bash
# 将 serviceAccountKey.json 转为一行
cat serviceAccountKey.json | python -m json.tool --compact
```

#### Firebase 前端配置
```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc
```

### 步骤 4: 重新部署

配置环境变量后：
1. 进入 **Deployments** 标签
2. 点击最新部署的 **"..."** 菜单
3. 选择 **"Redeploy"**
4. 等待 1-2 分钟

### 步骤 5: 测试

访问你的 Vercel URL：
```
https://your-app.vercel.app
```

测试 API：
```bash
curl https://your-app.vercel.app/api/
# 应返回: {"ok": true, "message": "🚀 Backend running on Vercel!"}
```

---

## 🔧 本地开发

### 安装依赖

```bash
# Node.js 依赖（前端）
npm install

# Python 依赖（后端 API）
pip install -r requirements.txt
```

### 配置环境变量

创建 `.env` 文件：
```env
# Firebase 凭证（后端）
FIREBASE_CREDENTIALS_JSON={"type":"service_account",...}

# Firebase 配置（前端）
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc

# API 基础路径（本地开发）
VITE_API_BASE=/api
```

### 启动开发服务器

#### 方式 1: 使用 Vercel CLI（推荐）

```bash
# 安装 Vercel CLI
npm i -g vercel

# 启动本地开发
vercel dev
```

访问 `http://localhost:3000`

#### 方式 2: 分别启动前后端

```bash
# 终端 1: 启动 Vite 开发服务器
npm run dev

# 终端 2: 启动 FastAPI（模拟后端）
cd api && uvicorn index:app --reload --port 8000
```

然后修改 `.env`:
```env
VITE_API_BASE=http://localhost:8000/api
```

---

## 🎯 工作原理

### 架构说明

```
┌─────────────────────────────────────────┐
│           Vercel 部署                    │
├─────────────────────────────────────────┤
│                                         │
│  前端 (Vite + React)                     │
│    ↓                                    │
│  /api/* → Serverless Functions          │
│    ↓                                    │
│  FastAPI Router                         │
│    ↓                                    │
│  Firebase Admin SDK                     │
│    ↓                                    │
│  Firestore Database                     │
│                                         │
└─────────────────────────────────────────┘
```

### URL 路由

- `/` → 前端 React 应用
- `/api/` → API 状态检查
- `/api/notes` → 笔记 CRUD
- `/api/test` → Firestore 连接测试

### Serverless Functions

Vercel 会自动将 `api/index.py` 转换为 Serverless Function，处理所有 `/api/*` 请求。

---

## 📋 环境变量说明

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `FIREBASE_CREDENTIALS_JSON` | ✅ | Firebase 服务账号 JSON（一行字符串） |
| `VITE_FIREBASE_API_KEY` | ✅ | Firebase API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | ✅ | Firebase Auth Domain |
| `VITE_FIREBASE_PROJECT_ID` | ✅ | Firebase Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | ✅ | Firebase Storage Bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ✅ | Firebase Sender ID |
| `VITE_FIREBASE_APP_ID` | ✅ | Firebase App ID |
| `VITE_API_BASE` | ❌ | API 基础路径（默认 `/api`） |

---

## 🔒 安全配置

### Firebase Authorized Domains

在 Firebase Console → Authentication → Settings 中添加：
- `your-app.vercel.app`
- `your-app-*.vercel.app`（预览部署）

### Firestore 安全规则

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /notes/{noteId} {
      // 只允许用户读写自己的笔记
      allow read, write: if request.auth != null && 
                           request.auth.uid == resource.data.uid;
      allow create: if request.auth != null && 
                      request.auth.uid == request.resource.data.uid;
    }
  }
}
```

---

## ⚠️ 常见问题

### 1. API 返回 500 错误

**原因**: Firebase 凭证配置不正确

**解决**:
1. 确认 `FIREBASE_CREDENTIALS_JSON` 是完整的一行 JSON
2. 检查 Vercel 部署日志中的错误信息
3. 重新部署

### 2. CORS 错误

**原因**: 预览部署域名未授权

**解决**:
在 Firebase Console 添加 Vercel 预览域名到 Authorized Domains

### 3. 无法登录

**原因**: Firebase 配置错误

**解决**:
检查所有 `VITE_FIREBASE_*` 环境变量是否正确

---

## 🚀 持续部署

现在配置完成后：
- 推送到 `main` 分支 → 自动部署到生产环境
- 创建 Pull Request → 自动创建预览部署
- 零停机更新

---

## 🎉 完成！

你的全栈应用现在完全运行在 Vercel 上，无需额外的后端服务器！

---

*最后更新: 2025-11-06*
