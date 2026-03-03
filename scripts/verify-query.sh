#!/usr/bin/env bash
# 验证 RAG query 接口：不长时间挂起，且在代理可用时能拿到 LLM 回答
set -e
MEMHUB_HOME="${MEMHUB_HOME:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$MEMHUB_HOME"

echo "==> 1. 检查后端存活..."
if ! curl -sf http://localhost:8000/health/live >/dev/null; then
  echo "    失败: 后端未启动，请先运行 scripts/startup.sh"
  exit 1
fi
echo "    通过"

echo "==> 2. 获取 API Key 与知识库 ID..."
API_KEY=$(docker compose exec -T postgres psql -U postgres -d memhub -t -c "SELECT api_key FROM users WHERE api_key IS NOT NULL LIMIT 1;" 2>/dev/null | tr -d ' \n')
KB_ID=$(docker compose exec -T postgres psql -U postgres -d memhub -t -c "SELECT id FROM knowledge_bases LIMIT 1;" 2>/dev/null | tr -d ' \n')
if [[ -z "$API_KEY" ]] || [[ -z "$KB_ID" ]]; then
  echo "    失败: 无用户 API Key 或知识库，请先登录并创建知识库"
  exit 1
fi
echo "    通过 (kb_id=$KB_ID)"

echo "==> 3. 调用 POST /api/knowledge-bases/$KB_ID/query（超时 75s）..."
START=$(date +%s)
RESP=$(curl -s -w "\n%{http_code}" --max-time 75 \
  -X POST "http://localhost:8000/api/knowledge-bases/$KB_ID/query" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"question":"请用一句话说明你是谁","top_k":2}')
END=$(date +%s)
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
ELAPSED=$((END - START))

echo "    耗时: ${ELAPSED}s   HTTP: $CODE"
if [[ "$CODE" == "200" ]]; then
  if echo "$BODY" | grep -q '暂时无法生成回答'; then
    echo "==> 接口正常(200)，当前为兜底文案（OpenAI 未通，请设置 HTTP_PROXY/HTTPS_PROXY 后重启后端）"
  elif echo "$BODY" | grep -q '知识库中暂无文档内容'; then
    echo "==> 接口正常(200)，当前知识库无文档内容，请先上传规则/文档后再试"
  else
    echo "==> 验证成功: 获得 LLM 回答"
    echo "$BODY" | head -c 300
    echo ""
  fi
  exit 0
elif [[ "$CODE" == "504" ]]; then
  echo "==> 验证通过: 约 70s 内返回 504，无长时间挂起"
  echo "    若需真实回答，请在后端进程所在环境设置代理后重启"
  exit 0
else
  echo "==> 响应异常: $CODE"
  echo "$BODY"
  exit 1
fi
