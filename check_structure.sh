#!/bin/bash

# 项目结构验证脚本
echo "🔍 检查项目结构..."

# 检查必需文件
REQUIRED_FILES=(
    "backend/main.py"
    "backend/requirements.txt"
    "backend/Procfile"
    "backend/railway.json"
    "backend/runtime.txt"
    "backend/.env.example"
    "frontend/package.json"
    "frontend/vite.config.js"
    "frontend/vercel.json"
    "frontend/.env.example"
    "README.md"
    "DEPLOYMENT.md"
)

missing_files=0
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ 缺失文件: $file"
        missing_files=$((missing_files + 1))
    else
        echo "✅ $file"
    fi
done

echo ""
echo "📊 检查结果:"
if [ $missing_files -eq 0 ]; then
    echo "✅ 所有必需文件都存在！"
    echo "🚀 项目已准备好部署到 Vercel 和 Railway"
else
    echo "⚠️  发现 $missing_files 个缺失文件"
    echo "请确保所有必需文件都已创建"
fi

echo ""
echo "📋 下一步:"
echo "1. 配置 Firebase 项目并下载 serviceAccountKey.json"
echo "2. 复制 .env.example 为 .env 并填入配置"
echo "3. 参考 DEPLOYMENT.md 进行部署"
