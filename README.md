# 🧠 GreatUniHackDemo — React + FastAPI + Firebase (Auth + Firestore)

A **minimal full-stack demo** for hackathons and rapid prototyping.  
It integrates a modern, production-style stack:

- 🪄 **Frontend**: React (Vite)
- ⚙️ **Backend**: FastAPI
- 🔐 **Auth + Database**: Firebase (Google Sign-In + Firestore)
- 💻 **Local Dev**: Windows + WSL2 friendly
- ☁️ **Deploy**: Vercel (frontend) + Railway / Render (backend)

> ⚠️ Always use **your own Firebase project** and **never commit private credentials**.

## 🧩 System Requirements

| Tool | Version (tested) |
|------|------------------|
| Node.js | ≥ 20.x |
| npm | ≥ 10.x |
| Python | ≥ 3.12 |
| Firebase project | Enabled Firestore + Auth |
| OS | Ubuntu / WSL2 / macOS |

---

## 📁 Project Structure

```

GreatUniHackDemo/
├─ frontend/            # React app (Vite)
│  ├─ src/
│  │   ├─ components/
│  │   │   ├─ Header.jsx
│  │   │   ├─ NoteList.jsx
│  │   │   └─ NoteForm.jsx
│  │   ├─ styles/
│  │   │   └─ app.css
│  │   ├─ App.jsx        # UI + Firebase login
│  │   ├─ api.js         # API calls to FastAPI
│  │   ├─ firebase.js    # Firebase config
│  │   └─ main.jsx
│  ├─ index.html
│  ├─ package.json
│  └─ vite.config.js
└─ backend/             # FastAPI backend
├─ main.py
├─ requirements.txt
├─ .env               # (optional) FIREBASE_CREDENTIALS_PATH
└─ serviceAccountKey.json 🔒

```

---

## ☁️ 1) Firebase Setup (one-time)

1. Go to **[Firebase Console](https://console.firebase.google.com)** → Create a new project.  
2. Enable **Authentication → Sign-in method → Google**.  
3. Create a **Web App** → copy config → paste into:
```

frontend/src/firebase.js

````
4. Generate a **Service Account Key**  
- Go to Project Settings → *Service Accounts* → *Generate New Private Key*  
- Rename to `serviceAccountKey.json`  
- Place it under `backend/serviceAccountKey.json`
5. Enable **Cloud Firestore (Native mode)**.

---

## 🧠 2) Local Development

### 🐍 Backend (FastAPI)
> 💡 Recommended to run in **WSL2 (Ubuntu)**

```bash
$ cd backend
$ python -m venv .venv
$ source .venv/bin/activate   # On PowerShell: .venv\Scripts\Activate.ps1
$ pip install -r requirements.txt

# Optionally: create a .env file
echo "FIREBASE_CREDENTIALS_PATH=backend/serviceAccountKey.json" > .env

# Run server
$ uvicorn main:app --reload --host 0.0.0.0 --port 8000
````

Visit: [http://127.0.0.1:8000](http://127.0.0.1:8000)

Expected output:

```json
{"ok": true, "message": "🚀 Backend running successfully!"}
```

---

### ⚛️ Frontend (React + Vite)

> 💡 Run in a separate terminal

```bash
$ cd ~/Projects/greatunihackdemo/frontend
$ npm install
$ npm run dev
```

Then open → **[http://localhost:5173](http://localhost:5173)**

---

## 🔐 3) How It Works

**Authentication flow**

1. User clicks **Sign in with Google**
2. Firebase Auth returns an **ID token**
3. Frontend sends:

   ```
   Authorization: Bearer <idToken>
   ```
4. FastAPI verifies token via **Firebase Admin SDK** → extracts UID

**Data flow**

* `GET /notes` → returns user’s notes
* `POST /notes` → adds `{ uid, text, createdAt }` to Firestore

Data model:

```
notes (collection)
 ├─ <noteID>
 │   ├─ uid: "firebase_uid_12345"
 │   ├─ text: "Hello GreatUniHack!"
 │   └─ createdAt: 1730886000000
```

---

## ⚠️ 4) Common Issues & Fixes

### 🔸 `400 The query requires an index`

Firestore needs a **composite index** for:

```python
.where("uid", "==", uid).order_by("createdAt")
```

✅ Fix:
Click the **“Create index”** link shown in the error → enable it → wait a minute → refresh page.

Alternative (no ordering):

```python
docs = db.collection("notes").where("uid", "==", uid).stream()
```

---

### 🔸 CORS Errors

If you see:

```
CORS Missing Allow Origin
```

Ensure backend has:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 🚀 5) Quick Test Run

```bash
# 1️⃣ Start backend
uvicorn main:app --reload --port 8000

# 2️⃣ Start frontend
npm run dev

# 3️⃣ Open
http://localhost:5173
```

Then:

* Sign in with Google
* Add a note
* It instantly syncs with Firestore 🔥

---

## ☁️ 6) Deployment Guide

### 📋 准备工作

在部署之前，确保你已经：
1. ✅ 创建并配置了 Firebase 项目
2. ✅ 下载了 `serviceAccountKey.json` 文件
3. ✅ 在 Firebase Console 中启用了 Firestore 和 Google 认证
4. ✅ 记录了前端的 Firebase 配置信息

---

### 🚂 后端部署到 Railway

#### 步骤 1: 准备 Railway 项目

1. 访问 [Railway.app](https://railway.app) 并登录
2. 点击 **"New Project"** → **"Deploy from GitHub repo"**
3. 选择你的仓库（确保已经推送到 GitHub）
4. Railway 会自动检测到 Python 项目

#### 步骤 2: 配置环境变量

在 Railway 项目的 **Variables** 标签页中添加：

```env
ALLOWED_ORIGINS=https://your-app.vercel.app,http://localhost:5173
PORT=8000
```

**注意**: 稍后将 `https://your-app.vercel.app` 替换为实际的 Vercel 域名

#### 步骤 3: 上传 Firebase 服务账号密钥

Railway 有两种方式上传敏感文件：

**方法 A: 通过环境变量（推荐）**
```bash
# 将 serviceAccountKey.json 内容转为 base64
cat backend/serviceAccountKey.json | base64 -w 0

# 在 Railway Variables 中添加：
FIREBASE_CREDENTIALS_BASE64=<base64编码的内容>
```

然后修改 `backend/main.py` 中的 `init_firebase()` 函数支持 base64 解码。

**方法 B: 使用 Railway Volumes（更简单）**
1. 在 Railway 项目设置中，进入 **Settings** → **Variables**
2. 点击 **"Raw Editor"**
3. 将整个 `serviceAccountKey.json` 的内容粘贴为多行变量（不推荐生产环境）

**推荐方法：直接在代码中通过环境变量传递 JSON**
```python
import json
import os
from firebase_admin import credentials

# 在 init_firebase() 中添加：
firebase_creds_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
if firebase_creds_json:
    cred_dict = json.loads(firebase_creds_json)
    cred = credentials.Certificate(cred_dict)
```

然后在 Railway Variables 中添加：
```
FIREBASE_CREDENTIALS_JSON={"type":"service_account","project_id":"..."}
```
（完整的 serviceAccountKey.json 内容作为一行 JSON 字符串）

#### 步骤 4: 配置部署设置

Railway 会自动使用项目中的配置文件：
- ✅ `runtime.txt` - 指定 Python 版本
- ✅ `Procfile` - 指定启动命令
- ✅ `railway.json` - Railway 特定配置

#### 步骤 5: 部署

1. Railway 会自动触发部署
2. 等待构建完成（约 2-3 分钟）
3. 部署成功后，复制生成的 URL（例如：`https://your-app.railway.app`）

#### 步骤 6: 测试后端

访问你的 Railway URL：
```
https://your-app.railway.app/
```

应该看到：
```json
{"ok": true, "message": "🚀 Backend running successfully!"}
```

---

### ▲ 前端部署到 Vercel

#### 步骤 1: 准备 Vercel 项目

1. 访问 [Vercel.com](https://vercel.com) 并登录
2. 点击 **"New Project"**
3. 导入你的 GitHub 仓库
4. Vercel 会自动检测到 Vite 项目

#### 步骤 2: 配置项目设置

在项目设置中：
- **Framework Preset**: Vite
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

这些设置已经在 `frontend/vercel.json` 中配置好了。

#### 步骤 3: 配置环境变量

在 Vercel 项目的 **Settings** → **Environment Variables** 中添加：

```env
# 后端 API URL（使用你的 Railway URL）
VITE_API_BASE=https://your-app.railway.app

# Firebase 配置（从 Firebase Console 获取）
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

**获取 Firebase 配置的步骤：**
1. 打开 [Firebase Console](https://console.firebase.google.com)
2. 选择你的项目
3. 进入 **Project Settings** → **General**
4. 滚动到 **"Your apps"** 部分
5. 点击你的 Web App，复制配置信息

#### 步骤 4: 部署

1. 点击 **"Deploy"**
2. Vercel 会自动构建和部署（约 1-2 分钟）
3. 部署成功后，你会获得一个 URL（例如：`https://your-app.vercel.app`）

#### 步骤 5: 更新后端 CORS 设置

现在你有了 Vercel 的 URL，需要更新 Railway 后端的 `ALLOWED_ORIGINS` 环境变量：

1. 返回 Railway 项目
2. 进入 **Variables**
3. 更新 `ALLOWED_ORIGINS`：
   ```
   ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-app-git-main-yourusername.vercel.app
   ```
4. Railway 会自动重新部署

**提示**: Vercel 为每个分支创建独立的预览 URL，你可能需要添加多个域名。

#### 步骤 6: 测试应用

1. 访问你的 Vercel URL
2. 点击 **"Sign in with Google"**
3. 添加一条笔记
4. 刷新页面，确认笔记已保存

---

### 🔧 部署后的常见问题

#### ❌ CORS 错误
**问题**: 前端无法连接后端，浏览器显示 CORS 错误

**解决方案**:
1. 检查 Railway 的 `ALLOWED_ORIGINS` 是否包含你的 Vercel 域名
2. 确保没有遗漏 `https://` 前缀
3. Vercel 可能有多个域名（主域名 + 预览域名），都需要添加

#### ❌ Firebase 认证失败
**问题**: 无法登录或显示 "Invalid token"

**解决方案**:
1. 确认 Vercel 的 Firebase 环境变量配置正确
2. 检查 Railway 是否成功加载了 `serviceAccountKey.json`
3. 在 Firebase Console 中检查 **Authorized domains**，添加你的 Vercel 域名

#### ❌ Railway 构建失败
**问题**: Railway 部署时出错

**解决方案**:
1. 检查 `requirements.txt` 是否正确
2. 确保 `runtime.txt` 指定的 Python 版本可用（推荐 3.12）
3. 查看 Railway 的构建日志，找到具体错误信息

#### ❌ Vercel 构建失败
**问题**: Vercel 构建时出错

**解决方案**:
1. 确保 `frontend` 目录被正确设置为 Root Directory
2. 检查 `package.json` 中的依赖是否完整
3. 查看 Vercel 的构建日志

---

### 🎯 部署检查清单

#### 后端 (Railway) ✅
- [ ] 项目已连接到 GitHub
- [ ] `ALLOWED_ORIGINS` 包含 Vercel 域名
- [ ] Firebase 凭证已配置（JSON 或文件）
- [ ] 部署成功，可以访问 `/` 端点
- [ ] `/test` 端点返回 Firestore 连接成功

#### 前端 (Vercel) ✅
- [ ] Root Directory 设置为 `frontend`
- [ ] `VITE_API_BASE` 指向 Railway URL
- [ ] 所有 Firebase 环境变量已配置
- [ ] 部署成功，页面可以正常加载
- [ ] Google 登录功能正常
- [ ] 可以成功创建和读取笔记

#### Firebase ✅
- [ ] Firestore 已启用
- [ ] Google 认证已启用
- [ ] Authorized domains 包含 Vercel 域名
- [ ] Firestore 规则已配置（建议按用户隔离数据）

---

### 📊 推荐的 Firestore 安全规则

部署后，更新 Firestore 规则以保护用户数据：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /notes/{noteId} {
      // 只允许用户读写自己的笔记
      allow read, write: if request.auth != null && 
                           request.auth.uid == resource.data.uid;
      // 允许用户创建笔记（必须包含正确的 uid）
      allow create: if request.auth != null && 
                      request.auth.uid == request.resource.data.uid;
    }
  }
}
```

在 Firebase Console → Firestore Database → Rules 中更新。

---

### 🚀 持续部署

现在你的应用已配置为持续部署：

- **前端**: 每次推送到 `main` 分支，Vercel 自动部署
- **后端**: 每次推送到 `main` 分支，Railway 自动部署
- **预览**: Vercel 为每个 PR 创建预览部署

---

## 🔒 7) Security Checklist

| ✅ Action                                 | Description                         |
| ---------------------------------------- | ----------------------------------- |
| 🔑 Don’t commit `serviceAccountKey.json` | Add to `.gitignore`                 |
| 🧩 Restrict Firestore rules              | Each user sees only their own notes |
| 🌍 Restrict CORS origins                 | Use your production domain only     |
| 🧠 Use `.env` files                      | Keep secrets out of code            |

---

## 🧱 8) Tech Summary

| Layer      | Tech                    | Purpose               |
| ---------- | ----------------------- | --------------------- |
| Frontend   | React (Vite)            | UI + Firebase Auth    |
| Backend    | FastAPI                 | API + Auth validation |
| Database   | Firestore               | Cloud-hosted NoSQL DB |
| Auth       | Firebase Auth (Google)  | Secure login          |
| Dev Env    | WSL2 + Node.js + Python | Local workflow        |
| Deployment | Vercel + Railway        | Hosting               |

---

## ✨ 9) Features

* 🔐 Google sign-in with Firebase
* 📝 Per-user personal notes
* ☁️ Notes persisted in Firestore
* ⚙️ FastAPI backend with token verification
* 💻 Works seamlessly on Windows + WSL2
* 🚀 Deployable in minutes

---

## 🧭 10) Known Limitations / Future Improvements

* ⏱️ Token validation timing issues (slight delay after login)
* 💬 Real-time sync (Firestore listener) not yet implemented
* 📱 Responsive design can be improved
* 🧩 Better error handling / retry system (planned)

---

## 👤 Author & License

Made for **GreatUniHack** 🏫
MIT License · © 2025