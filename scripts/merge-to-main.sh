#!/usr/bin/env bash
set -euo pipefail

# 用法：
#   ./scripts/merge-to-main.sh
# 可选环境变量：
#   REMOTE=origin MAIN_BRANCH=main ./scripts/merge-to-main.sh

REMOTE="${REMOTE:-origin}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"
SOURCE_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

echo "==> 开始执行分支合并流程"
echo "    远端: $REMOTE"
echo "    源分支: $SOURCE_BRANCH"
echo "    目标分支: $MAIN_BRANCH"
echo ""

if ! command -v git >/dev/null 2>&1; then
  echo "错误: 未找到 git 命令" >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "错误: 当前目录不是 git 仓库" >&2
  exit 1
fi

if [[ -z "$SOURCE_BRANCH" ]]; then
  echo "错误: 无法识别当前分支" >&2
  exit 1
fi

if [[ "$SOURCE_BRANCH" == "$MAIN_BRANCH" ]]; then
  echo "错误: 当前分支已是 $MAIN_BRANCH，请切换到要合并的功能分支后再执行" >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "错误: 工作区存在未提交变更，请先提交或暂存后重试" >&2
  exit 1
fi

echo "==> 拉取远端最新信息"
git fetch "$REMOTE" --prune

if ! git show-ref --verify --quiet "refs/heads/$SOURCE_BRANCH"; then
  if git show-ref --verify --quiet "refs/remotes/$REMOTE/$SOURCE_BRANCH"; then
    git checkout -b "$SOURCE_BRANCH" "$REMOTE/$SOURCE_BRANCH"
  else
    echo "错误: 本地与远端均不存在分支 $SOURCE_BRANCH" >&2
    exit 1
  fi
fi

if ! git show-ref --verify --quiet "refs/heads/$MAIN_BRANCH"; then
  if git show-ref --verify --quiet "refs/remotes/$REMOTE/$MAIN_BRANCH"; then
    git checkout -b "$MAIN_BRANCH" "$REMOTE/$MAIN_BRANCH"
  else
    echo "错误: 本地与远端均不存在分支 $MAIN_BRANCH" >&2
    exit 1
  fi
fi

echo "==> 更新 $SOURCE_BRANCH"
git checkout "$SOURCE_BRANCH"
git pull --ff-only "$REMOTE" "$SOURCE_BRANCH"

echo "==> 更新 $MAIN_BRANCH"
git checkout "$MAIN_BRANCH"
git pull --ff-only "$REMOTE" "$MAIN_BRANCH"

echo "==> 合并 $SOURCE_BRANCH -> $MAIN_BRANCH"
git merge "$SOURCE_BRANCH"

echo "==> 推送 $MAIN_BRANCH 到 $REMOTE"
git push "$REMOTE" "$MAIN_BRANCH"

echo "==> 切换回 $SOURCE_BRANCH"
git checkout "$SOURCE_BRANCH"

echo ""
echo "✅ 完成：$SOURCE_BRANCH 已合并到 $MAIN_BRANCH 并推送，当前分支为 $SOURCE_BRANCH"
