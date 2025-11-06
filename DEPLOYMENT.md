# 🚀 部署快速指南

## 🎯 部署顺序

建议按照以下顺序部署：

1. **后端部署到 Railway** ⚙️
2. **前端部署到 Vercel** ▲
3. **配置 CORS** 🔐
4. **测试功能** ✅

---

## 🚂 Railway 后端部署（10分钟）

### 1. 创建项目
- 访问 https://railway.app
- New Project → Deploy from GitHub repo
- 选择你的仓库

### ⚠️ 重要：设置 Root Directory
Railway 会检测到整个项目，需要指定后端目录：

1. 进入项目设置 **Settings**
2. 找到 **Root Directory** 设置
3. 输入：`backend`
4. 点击 **Save**

这样 Railway 就会只部署 `backend/` 目录中的代码。

### 2. 配置环境变量
```env
PORT=8000
ALLOWED_ORIGINS=http://localhost:5173
FIREBASE_CREDENTIALS_JSON={"type":"service_account",...}
```

**获取 FIREBASE_CREDENTIALS_JSON**：
```bash
# 复制 serviceAccountKey.json 的全部内容
# 删除所有换行符，变成一行 JSON 字符串
cat backend/serviceAccountKey.json | jq -c
```

### 3. 等待部署
- Railway 自动检测配置文件
- 等待 2-3 分钟
- 获取 Railway URL: `https://your-app.railway.app`

### 4. 测试后端
```bash
curl https://your-app.railway.app/
# 应返回: {"ok": true, "message": "🚀 Backend running successfully!"}
```

---

## ▲ Vercel 前端部署（5分钟）

### 1. 创建项目
- 访问 https://vercel.com
- New Project → Import from GitHub
- 选择你的仓库

### 2. 配置项目
- **Framework**: Vite
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

### 3. 配置环境变量

**必需变量**：
```env
VITE_API_BASE=https://your-app.railway.app
```

**Firebase 配置**（从 Firebase Console 复制）：
```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc
```

### 4. 部署
- 点击 Deploy
- 等待 1-2 分钟
- 获取 Vercel URL: `https://your-app.vercel.app`

---

## 🔐 配置 CORS（关键步骤）

### 更新 Railway 环境变量

返回 Railway，更新 `ALLOWED_ORIGINS`：

```env
ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-app-git-main-username.vercel.app,http://localhost:5173
```

**说明**：
- 第一个是生产域名
- 第二个是 Vercel 预览域名（包含分支名）
- 第三个是本地开发域名

Railway 会自动重新部署（约 1 分钟）。

---

## ✅ 测试清单

### 后端测试
```bash
# 1. 测试健康检查
curl https://your-app.railway.app/

# 2. 测试数据库连接
curl https://your-app.railway.app/test
```

### 前端测试
1. ✅ 访问 Vercel URL
2. ✅ 页面正常加载
3. ✅ 点击 "Sign in with Google"
4. ✅ 成功登录
5. ✅ 添加一条笔记
6. ✅ 刷新页面，笔记仍然存在

---

## 🔥 Firebase 配置

### Authorized Domains
在 Firebase Console → Authentication → Settings → Authorized domains

添加：
- ✅ `your-app.vercel.app`
- ✅ `your-app-git-main-username.vercel.app`（如果需要预览部署）

### Firestore 安全规则

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /notes/{noteId} {
      allow read, write: if request.auth != null && 
                           request.auth.uid == resource.data.uid;
      allow create: if request.auth != null && 
                      request.auth.uid == request.resource.data.uid;
    }
  }
}
```

---

## ⚠️ 常见问题快速修复

### CORS 错误
```
Access to fetch at 'https://...' has been blocked by CORS policy
```
**解决**: 确保 Railway 的 `ALLOWED_ORIGINS` 包含完整的 Vercel 域名（含 `https://`）

### Firebase 认证失败
```
Firebase: Error (auth/invalid-api-key)
```
**解决**: 检查 Vercel 环境变量中的 Firebase 配置是否完整且正确

### 后端 500 错误
```
{"detail": "..."}
```
**解决**: 
1. 查看 Railway 日志
2. 确认 `FIREBASE_CREDENTIALS_JSON` 格式正确
3. 检查 Firestore 是否已启用

### 笔记无法保存
```
Failed to fetch notes
```
**解决**:
1. 检查 `VITE_API_BASE` 是否正确
2. 测试后端 `/notes` 端点
3. 确认已登录（检查 Authorization header）

---

## 📊 环境变量速查表

### Railway 后端
| 变量 | 示例值 | 必需 |
|------|--------|------|
| `PORT` | `8000` | ❌ (自动) |
| `ALLOWED_ORIGINS` | `https://app.vercel.app,http://localhost:5173` | ✅ |
| `FIREBASE_CREDENTIALS_JSON` | `{"type":"service_account",...}` | ✅ |

### Vercel 前端
| 变量 | 示例值 | 必需 |
|------|--------|------|
| `VITE_API_BASE` | `https://app.railway.app` | ✅ |
| `VITE_FIREBASE_API_KEY` | `AIza...` | ✅ |
| `VITE_FIREBASE_AUTH_DOMAIN` | `project.firebaseapp.com` | ✅ |
| `VITE_FIREBASE_PROJECT_ID` | `project-id` | ✅ |
| `VITE_FIREBASE_STORAGE_BUCKET` | `project.appspot.com` | ✅ |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `123456789` | ✅ |
| `VITE_FIREBASE_APP_ID` | `1:123:web:abc` | ✅ |

---

## 🎉 部署完成！

现在你的应用已经成功部署，享受自动化的持续部署：
- 推送到 GitHub → 自动部署到 Railway & Vercel
- 创建 PR → Vercel 自动生成预览链接
- 零停机更新 🚀
