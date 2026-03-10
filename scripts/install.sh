#!/usr/bin/env bash
set -euo pipefail

MEMHUB_REPO="${MEMHUB_REPO:-https://github.com/liam798/MemHub.git}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT_FROM_SCRIPT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$REPO_ROOT_FROM_SCRIPT/docker-compose.yml" && -d "$REPO_ROOT_FROM_SCRIPT/backend" && -d "$REPO_ROOT_FROM_SCRIPT/frontend" ]]; then
  DEFAULT_MEMHUB_HOME="$REPO_ROOT_FROM_SCRIPT"
else
  DEFAULT_MEMHUB_HOME="$(pwd)/MemHub"
fi

MEMHUB_HOME="${MEMHUB_HOME:-$DEFAULT_MEMHUB_HOME}"

echo "==> MemHub 一键部署"
echo "    安装目录: $MEMHUB_HOME"
echo ""

if ! command -v docker &>/dev/null; then
  echo "错误: 请先安装 Docker (https://docs.docker.com/get-docker/)" >&2
  exit 1
fi
if ! docker compose version &>/dev/null; then
  echo "错误: 请先安装 Docker Compose (https://docs.docker.com/compose/install/)" >&2
  exit 1
fi

if [[ -d "$MEMHUB_HOME" && -f "$MEMHUB_HOME/docker-compose.yml" ]]; then
  echo "==> 使用已有目录: $MEMHUB_HOME"
  cd "$MEMHUB_HOME"
  git pull --rebase 2>/dev/null || true
else
  echo "==> 克隆仓库..."
  git clone --depth 1 "$MEMHUB_REPO" "$MEMHUB_HOME"
  cd "$MEMHUB_HOME"
fi

echo "==> 检查 backend/.env"
NEED_ENV_REMIND=false
if [[ ! -f backend/.env ]]; then
  echo "    生成 backend/.env"
  cp backend/.env.example backend/.env
  NEED_ENV_REMIND=true
else
  OPENAI_KEY=$(grep -E '^OPENAI_API_KEY=' backend/.env 2>/dev/null | sed 's/^OPENAI_API_KEY=//' | tr -d '\r"' | xargs || true)
  if [[ -z "$OPENAI_KEY" || "$OPENAI_KEY" == *"your-openai-api-key"* || "$OPENAI_KEY" == "sk-your-openai-api-key" ]]; then
    NEED_ENV_REMIND=true
  fi
fi
if [[ "$NEED_ENV_REMIND" == "true" ]]; then
  echo "    ⚠ 请编辑 backend/.env 填写 OPENAI_API_KEY 后再使用 RAG 功能。"
fi

echo "==> 使用 Docker 构建并启动全部服务（postgres/backend/frontend）..."
docker compose up -d --build

echo ""
echo "==> 安装完成，服务已启动"
echo "    前端: http://localhost:3100"
echo "    后端: http://localhost:18000"
echo "    查看状态: cd $MEMHUB_HOME && docker compose ps"
echo "    查看日志: cd $MEMHUB_HOME && docker compose logs -f"
echo "    重启服务: cd $MEMHUB_HOME && ./scripts/startup.sh"
echo ""
