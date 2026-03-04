#!/usr/bin/env bash
set -euo pipefail

# 脚本所在仓库根目录（与 install.sh 解耦，可单独在已克隆的目录内执行）
MEMHUB_HOME="${MEMHUB_HOME:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$MEMHUB_HOME"

if [[ ! -f docker-compose.yml ]]; then
  echo "错误: 未找到 docker-compose.yml，请先在 MemHub 项目根目录执行或先运行 scripts/install.sh" >&2
  exit 1
fi

echo "==> MemHub 启动 (目录: $MEMHUB_HOME)"
echo ""

echo "==> 使用 Docker 启动全部服务（postgres/backend/frontend）..."
docker compose up -d --build

echo ""
echo "==> 服务已启动"
echo "    前端: http://localhost:3100"
echo "    后端: http://localhost:8000"
echo "    查看状态: docker compose ps"
echo "    查看日志: docker compose logs -f"
echo "    停止服务: docker compose down"
echo ""
