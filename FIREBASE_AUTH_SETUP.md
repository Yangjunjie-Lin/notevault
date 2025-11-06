# 🔐 Firebase 认证配置指南

## ❌ 问题：登录弹窗立即关闭

如果你遇到以下情况：
- 点击 "Sign in with Google"
- 弹窗打开但立即关闭
- 或者显示空白页面
- 或者提示 "This app is not authorized"

**原因**：你的部署域名没有添加到 Firebase Authorized Domains。

---

## ✅ 解决方案

### 步骤 1: 添加 Authorized Domains

1. 打开 [Firebase Console](https://console.firebase.google.com)
2. 选择你的项目（例如：`greatunihackdemo`）
3. 进入 **Authentication**（身份验证）
4. 点击 **Settings**（设置）标签
5. 滚动到 **Authorized domains**（已授权的网域）
6. 点击 **Add domain**（添加网域）

#### 需要添加的域名：

**本地开发：**
```
localhost
```

**Vercel 部署：**
```
your-app.vercel.app
your-app-git-main-username.vercel.app
```

**注意**：
- 不要包含 `http://` 或 `https://`
- 只需要域名本身
- Vercel 的预览部署会有不同的域名格式

#### 获取 Vercel 域名的方法：

1. 进入 Vercel 项目
2. 进入 **Deployments** 标签
3. 复制部署的 URL（例如：`your-app-abc123.vercel.app`）
4. 去掉 `https://`，只留下域名

### 步骤 2: 配置 Vercel 环境变量

确保在 Vercel 项目中配置了所有 Firebase 环境变量：

```env
VITE_FIREBASE_API_KEY=AIzaSyBp2Yj1yzvbDBlI0Iu0yt75C5y6hCTu2xM
VITE_FIREBASE_AUTH_DOMAIN=greatunihackdemo.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=greatunihackdemo
VITE_FIREBASE_STORAGE_BUCKET=greatunihackdemo.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=616164585973
VITE_FIREBASE_APP_ID=1:616164585973:web:9aaadd55b5cf947d5930bc
```

**在 Vercel Dashboard：**
1. 进入项目 → **Settings** → **Environment Variables**
2. 添加每个变量
3. 应用到 **All environments** (Production, Preview, Development)
4. 保存后重新部署

### 步骤 3: 强制账号选择

我已经在代码中添加了 `prompt: 'select_account'` 参数：

```javascript
provider.setCustomParameters({
  prompt: 'select_account'
})
```

这会强制 Google 显示账号选择页面，即使你已经登录。

### 步骤 4: 重新部署

配置完成后：
1. 推送最新代码到 GitHub
2. 在 Vercel 重新部署
3. 清除浏览器缓存（或使用无痕模式测试）

---

## 🧪 测试步骤

1. **打开你的应用**
   ```
   https://your-app.vercel.app
   ```

2. **打开浏览器开发者工具**
   - 按 F12
   - 进入 **Console** 标签

3. **点击 "Sign in with Google"**
   
4. **检查是否有错误**
   - 如果看到 `auth/unauthorized-domain` 错误
     → 去 Firebase Console 添加域名
   
   - 如果看到 `auth/popup-blocked` 错误
     → 允许浏览器弹窗
   
   - 如果看到配置错误
     → 检查 Vercel 环境变量

---

## 📋 完整的 Firebase 配置检查清单

### Firebase Console
```
□ Authentication 已启用
□ Google Sign-in 已启用
□ Authorized domains 包含你的 Vercel 域名
□ Authorized domains 包含 localhost（本地开发）
□ Firestore Database 已创建
```

### Vercel Dashboard
```
□ 所有 VITE_FIREBASE_* 环境变量已配置
□ 环境变量应用到所有环境
□ 已重新部署
```

### 代码
```
□ src/firebase.js 使用环境变量（不是硬编码）
□ GoogleAuthProvider 配置了 prompt: 'select_account'
□ 浏览器允许弹窗
```

---

## 🔍 调试技巧

### 检查环境变量是否生效

在浏览器控制台运行：

```javascript
console.log({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID
})
```

如果显示 `undefined`，说明环境变量没有配置。

### 检查 Firebase 配置

```javascript
import { auth } from './firebase'
console.log(auth.app.options)
```

应该显示完整的 Firebase 配置。

---

## 💡 常见问题

### Q1: 弹窗被浏览器拦截
**A**: 点击浏览器地址栏右侧的弹窗拦截图标，允许弹窗。

### Q2: 显示 "This app is not authorized"
**A**: 域名没有添加到 Firebase Authorized Domains。

### Q3: 本地开发可以，Vercel 部署不行
**A**: 
1. 确认 Vercel 域名已添加到 Authorized Domains
2. 确认 Vercel 环境变量已配置
3. 清除浏览器缓存

### Q4: 每次都要选择账号
**A**: 这是正常的，因为我们设置了 `prompt: 'select_account'`。可以移除这个参数来保持登录状态。

---

## 🎯 快速修复命令

如果你想临时使用硬编码配置测试（**不推荐生产环境**）：

```javascript
// src/firebase.js
const firebaseConfig = {
  apiKey: "AIzaSyBp2Yj1yzvbDBlI0Iu0yt75C5y6hCTu2xM",
  authDomain: "greatunihackdemo.firebaseapp.com",
  projectId: "greatunihackdemo",
  storageBucket: "greatunihackdemo.firebasestorage.app",
  messagingSenderId: "616164585973",
  appId: "1:616164585973:web:9aaadd55b5cf947d5930bc"
}
```

但记得在 Firebase Console 添加你的域名！

---

**最重要的是：在 Firebase Console 的 Authorized Domains 中添加你的 Vercel 域名！** 🔑
