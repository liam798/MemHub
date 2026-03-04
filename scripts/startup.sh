#!/usr/bin/env bash
set -e

# 脚本所在仓库根目录（与 install.sh 解耦，可单独在已克隆的目录内执行）
MEMHUB_HOME="${MEMHUB_HOME:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$MEMHUB_HOME"

if [[ ! -f docker-compose.yml ]]; then
  echo "错误: 未找到 docker-compose.yml，请先在 MemHub 项目根目录执行或先运行 scripts/install.sh" >&2
  exit 1
fi

echo "==> MemHub 启动 (目录: $MEMHUB_HOME)"
echo ""

echo "==> 启动 PostgreSQL (Docker)..."
docker compose up -d

echo "==> 启动后端与前端服务..."
(cd "$MEMHUB_HOME/backend" && uvicorn app.main:app --reload --host 0.0.0.0) &
BACKEND_PID=$!
(cd "$MEMHUB_HOME/frontend" && npm run dev) &
FRONTEND_PID=$!

sleep 2
echo ""
echo "==> 服务已启动"
echo "    后端 PID: $BACKEND_PID  (端口 8000)"
echo "    前端 PID: $FRONTEND_PID (端口 3000)"
echo "    浏览器访问: http://localhost:3100"
echo "    停止服务: kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo "按 Ctrl+C 停止所有服务并退出。"
echo ""

wait
