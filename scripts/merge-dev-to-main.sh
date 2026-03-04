#!/usr/bin/env bash
set -euo pipefail

# 用法：
#   ./scripts/merge-dev-to-main.sh
# 可选环境变量：
#   REMOTE=origin MAIN_BRANCH=main DEV_BRANCH=dev ./scripts/merge-dev-to-main.sh

REMOTE="${REMOTE:-origin}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"
DEV_BRANCH="${DEV_BRANCH:-dev}"

echo "==> 开始执行分支合并流程"
echo "    远端: $REMOTE"
echo "    源分支: $DEV_BRANCH"
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

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "错误: 工作区存在未提交变更，请先提交或暂存后重试" >&2
  exit 1
fi

echo "==> 拉取远端最新信息"
git fetch "$REMOTE" --prune

if ! git show-ref --verify --quiet "refs/heads/$DEV_BRANCH"; then
  if git show-ref --verify --quiet "refs/remotes/$REMOTE/$DEV_BRANCH"; then
    git checkout -b "$DEV_BRANCH" "$REMOTE/$DEV_BRANCH"
  else
    echo "错误: 本地与远端均不存在分支 $DEV_BRANCH" >&2
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

echo "==> 更新 $DEV_BRANCH"
git checkout "$DEV_BRANCH"
git pull --ff-only "$REMOTE" "$DEV_BRANCH"

echo "==> 更新 $MAIN_BRANCH"
git checkout "$MAIN_BRANCH"
git pull --ff-only "$REMOTE" "$MAIN_BRANCH"

echo "==> 合并 $DEV_BRANCH -> $MAIN_BRANCH"
git merge "$DEV_BRANCH"

echo "==> 推送 $MAIN_BRANCH 到 $REMOTE"
git push "$REMOTE" "$MAIN_BRANCH"

echo "==> 切换回 $DEV_BRANCH"
git checkout "$DEV_BRANCH"

echo ""
echo "✅ 完成：$DEV_BRANCH 已合并到 $MAIN_BRANCH 并推送，当前分支为 $DEV_BRANCH"
