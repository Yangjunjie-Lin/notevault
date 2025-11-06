# 🔧 Railway 部署故障排除

## ❌ 问题：Railpack 无法识别项目类型

### 错误信息
```
⚠ Script start.sh not found
✖ Railpack could not determine how to build the app.
```

### 原因
Railway 检测到的是整个项目根目录，而不是 `backend/` 子目录。项目根目录同时包含前端和后端，导致 Railway 无法自动识别。

### ✅ 解决方案 1：设置 Root Directory（推荐）⭐⭐⭐⭐⭐

这是**最简单且推荐**的方法，无需任何配置文件：

#### 步骤：
1. 在 Railway Dashboard 中，点击你的服务
2. 进入 **Settings** 标签
3. 找到 **Service** 部分下的 **Root Directory**
4. 输入：`backend`
5. 点击右侧的勾选按钮保存
6. Railway 会自动重新部署

#### 为什么推荐这个方法？
- ✅ 无需修改任何配置文件
- ✅ Railway 自动检测 Python 项目
- ✅ 自动使用正确的 Python 版本
- ✅ 自动安装 requirements.txt
- ✅ 自动使用 Procfile 或检测启动命令

#### 截图位置：
```
Project → Service → Settings → Service → Root Directory
输入: backend
保存（点击勾选图标）
```

现在 Railway 只会分析和部署 `backend/` 目录，能正确识别为 Python 项目并自动配置所有内容。

---

### ❌ 不推荐：使用 nixpacks.toml 或 railway.toml

虽然可以通过配置文件指定构建方式，但这会增加复杂性：
- ❌ 需要手动配置 Python 路径
- ❌ 可能与 Railway 的自动检测冲突
- ❌ 维护成本高

**结论**：对于本项目，直接设置 Root Directory 是最佳方案。

---

## 🎯 推荐方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **Root Directory** | 最简单，UI 操作，自动检测 | 需要手动设置一次 | ⭐⭐⭐⭐⭐ |
| ~~nixpacks.toml~~ | ~~配置即代码~~ | 容易出错，维护复杂 | ❌ 不推荐 |
| ~~单独仓库~~ | ~~完全分离~~ | 维护复杂 | ❌ 不推荐 |

**结论**：对于 monorepo 项目，使用 Railway 的 Root Directory 设置是最佳实践。

---

## 📋 完整部署步骤（使用 Root Directory）

### 1. 创建 Railway 项目
```
1. 访问 https://railway.app
2. 点击 "New Project"
3. 选择 "Deploy from GitHub repo"
4. 选择 personal-notebook-app 仓库
```

### 2. 设置 Root Directory ⚠️ 关键步骤
```
1. 项目创建后，点击服务名称
2. 进入 "Settings" 标签
3. 找到 "Root Directory" 输入框
4. 输入: backend
5. 点击保存（勾选按钮）
```

### 3. 配置环境变量
```
1. 进入 "Variables" 标签
2. 添加以下变量：

ALLOWED_ORIGINS=http://localhost:5173
FIREBASE_CREDENTIALS_JSON={"type":"service_account",...}
```

### 4. 等待部署完成
```
1. Railway 会自动重新部署
2. 查看 "Deployments" 标签监控进度
3. 部署成功后，复制 Railway URL
```

### 5. 验证部署
```bash
curl https://YOUR-APP.railway.app/
# 应返回: {"ok": true, "message": "🚀 Backend running successfully!"}
```

---

## 🔍 检查部署日志

如果部署失败，查看日志：

### 在 Railway Dashboard
```
1. 点击你的服务
2. 进入 "Deployments" 标签
3. 点击最新的部署
4. 查看 "Build Logs" 和 "Deploy Logs"
```

### 常见日志错误

#### 错误 1: Python 依赖安装失败
```
ERROR: Could not find a version that satisfies the requirement...
```
**解决**：检查 `backend/requirements.txt` 格式

#### 错误 2: Firebase 凭证错误
```
Firebase service account JSON not found
```
**解决**：确认 `FIREBASE_CREDENTIALS_JSON` 环境变量格式正确（必须是一行 JSON）

#### 错误 3: 端口绑定失败
```
[ERROR] Error binding to 0.0.0.0:8000
```
**解决**：确保使用 `$PORT` 环境变量，不要硬编码端口

---

## 🧪 本地测试 Railway 构建

使用 nixpacks CLI 在本地测试（可选）：

```bash
# 安装 nixpacks
curl -sSL https://nixpacks.com/install.sh | bash

# 测试构建（从项目根目录）
nixpacks build . --name test-build

# 测试构建（指定 backend 目录）
nixpacks build backend --name test-backend
```

---

## 📊 部署状态检查清单

部署完成后，逐一检查：

```
□ Railway 服务显示 "Active"
□ Build Logs 显示成功（绿色勾选）
□ Deploy Logs 显示 "uvicorn" 启动信息
□ 访问 Railway URL 返回 {"ok": true}
□ /test 端点返回 Firestore 连接成功
□ 环境变量已全部配置
□ Settings 中 Root Directory = backend
```

---

## 🔄 重新部署

如果需要重新部署：

### 方式 1：推送代码（自动）
```bash
git add .
git commit -m "Update backend"
git push origin main
# Railway 自动检测并重新部署
```

### 方式 2：手动触发
```
Railway Dashboard → Deployments → "Redeploy"
```

### 方式 3：重启服务
```
Railway Dashboard → Settings → "Restart"
```

---

## 💡 最佳实践

1. ✅ **始终设置 Root Directory**
   - 对于 monorepo 项目必不可少
   - 避免 Railway 分析无关文件

2. ✅ **使用环境变量**
   - 不要硬编码配置
   - 敏感信息通过环境变量传递

3. ✅ **监控部署日志**
   - 每次部署后检查日志
   - 及时发现潜在问题

4. ✅ **版本控制**
   - 使用 `runtime.txt` 指定 Python 版本
   - 锁定依赖版本（`requirements.txt`）

5. ✅ **健康检查**
   - 实现 `/health` 或 `/` 端点
   - 方便监控服务状态

---

## 🎉 完成！

设置 Root Directory 后，Railway 应该能够正确识别并部署你的 Python 后端。

如果还有问题，请检查：
- ✓ Root Directory 是否设置为 `backend`
- ✓ 环境变量是否正确配置
- ✓ 部署日志中的具体错误信息

---

*最后更新: 2025-11-06*
