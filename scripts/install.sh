#!/usr/bin/env bash
set -e

MEMHUB_REPO="${MEMHUB_REPO:-https://github.com/liam798/MemHub.git}"
MEMHUB_HOME="${MEMHUB_HOME:-$(pwd)/MemHub}"

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

echo "==> 启动 PostgreSQL (Docker)..."
docker compose up -d

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

echo "==> 安装后端依赖并执行数据库迁移..."
(cd backend && pip install -q -r requirements.txt 2>/dev/null; alembic upgrade head)

echo "==> 安装前端依赖..."
(cd frontend && npm install)

echo ""
echo "==> 安装完成。运行以下命令启动服务："
echo "    cd $MEMHUB_HOME && ./scripts/startup.sh"
echo ""
echo "或直接执行："
echo "    ./scripts/startup.sh"
echo ""
