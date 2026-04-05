#!/usr/bin/env bash
# 首次 / 换机安装依赖（macOS / Linux / WSL）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "========================================"
echo "  PDF Reading Agent - 安装依赖"
echo "  $ROOT"
echo "========================================"

command -v python3 >/dev/null 2>&1 || { echo "错误: 需要 python3"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "错误: 需要 npm (Node.js 18+)"; exit 1; }

echo ""
echo "[1/2] 后端..."
python3 -m pip install -r "$ROOT/backend/requirements.txt"

echo ""
echo "[2/2] 前端..."
(cd "$ROOT/frontend" && npm install)

echo ""
echo "完成。请: cp .env.example .env 并编辑，然后分别启动 backend 与 frontend（见 README）。"
echo "自检: python3 -c 'import uvicorn' && test -d frontend/node_modules && echo OK"
