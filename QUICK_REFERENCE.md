# 🚀 快速部署参考卡

## 📋 部署前准备清单

### Firebase 设置
```bash
□ 创建 Firebase 项目
□ 启用 Firestore (Native 模式)
□ 启用 Google 认证
□ 下载 serviceAccountKey.json
□ 复制前端 Firebase 配置
```

### 代码准备
```bash
□ 推送代码到 GitHub
□ serviceAccountKey.json 未提交
□ 运行 ./check_structure.sh 验证
```

---

## 🚂 Railway 后端部署

### ⚠️ 重要：Root Directory 设置
```
Settings → Root Directory → backend
```
**必须设置**，否则 Railway 无法识别项目类型。

### 环境变量（必需）
```env
ALLOWED_ORIGINS=https://YOUR-APP.vercel.app,http://localhost:5173
FIREBASE_CREDENTIALS_JSON={"type":"service_account",...完整JSON...}
```

### 获取 Firebase JSON
```bash
# 方法1: 复制文件内容为一行
cat backend/serviceAccountKey.json | jq -c

# 方法2: 手动删除所有换行符
```

### 验证部署
```bash
curl https://YOUR-APP.railway.app/
# 应返回: {"ok": true, "message": "🚀 Backend running successfully!"}
```

---

## ▲ Vercel 前端部署

### 项目设置
```
Framework Preset: Vite
Root Directory: frontend
Build Command: npm run build
Output Directory: dist
```

### 环境变量（必需）
```env
VITE_API_BASE=https://YOUR-APP.railway.app

# Firebase 配置（从 Firebase Console 获取）
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc
```

### 获取 Firebase 配置
```
1. 打开 Firebase Console
2. Project Settings → General
3. Your apps → Web App
4. 复制配置对象
```

---

## 🔄 部署后配置

### 1. 更新 Railway CORS
```env
# 添加 Vercel 域名
ALLOWED_ORIGINS=https://YOUR-APP.vercel.app,https://YOUR-APP-git-main-USER.vercel.app,http://localhost:5173
```

### 2. Firebase Authorized Domains
```
Firebase Console → Authentication → Settings → Authorized domains
添加: YOUR-APP.vercel.app
```

### 3. Firestore 安全规则
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

## ✅ 测试清单

### 后端测试
```bash
# 健康检查
curl https://YOUR-APP.railway.app/
# ✓ 应返回 {"ok": true, ...}

# 数据库连接
curl https://YOUR-APP.railway.app/test
# ✓ 应返回 {"ok": true, "message": "Firestore connected ✅"}
```

### 前端测试
```
□ 访问 Vercel URL
□ 页面正常加载
□ 点击 "Sign in with Google"
□ 成功登录
□ 添加笔记
□ 刷新后笔记仍存在
```

---

## ⚠️ 常见问题速查

### CORS 错误
```
错误: Access blocked by CORS policy
解决: 检查 Railway ALLOWED_ORIGINS 包含完整 Vercel URL (含 https://)
```

### Firebase 认证失败
```
错误: auth/invalid-api-key
解决: 检查 Vercel 的 VITE_FIREBASE_* 环境变量
```

### 后端启动失败
```
错误: Firebase credentials not found
解决: 确认 FIREBASE_CREDENTIALS_JSON 格式正确（一行 JSON）
```

### 笔记无法保存
```
错误: 401 Unauthorized
解决: 
1. 确认已登录
2. 检查 VITE_API_BASE 配置
3. 测试后端 /notes 端点
```

---

## 📞 帮助资源

| 文档 | 用途 |
|------|------|
| `README.md` | 完整项目文档 |
| `DEPLOYMENT.md` | 详细部署步骤 |
| `CHANGELOG.md` | 变更记录 |
| `SUMMARY.md` | 配置总结 |
| `.env.example` | 环境变量说明 |

### 验证脚本
```bash
./check_structure.sh  # 检查项目结构
```

---

## 🎯 部署时间估计

| 步骤 | 时间 |
|------|------|
| Firebase 设置 | 5 分钟 |
| Railway 部署 | 10 分钟 |
| Vercel 部署 | 5 分钟 |
| 配置和测试 | 5 分钟 |
| **总计** | **~25 分钟** |

---

## 🔑 关键命令

```bash
# 验证项目结构
./check_structure.sh

# 将 Firebase JSON 转为一行
cat backend/serviceAccountKey.json | jq -c

# 本地运行后端
cd backend && uvicorn main:app --reload

# 本地运行前端
cd frontend && npm run dev

# 查看 Git 状态
git status

# 推送到 GitHub（触发自动部署）
git push origin main
```

---

**💡 提示**: 保存此文件作为快速参考！部署过程中遇到问题可随时查看。

---

*版本: 2.0 | 最后更新: 2025-11-06*
