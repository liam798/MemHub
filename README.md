# MemHub - 面向 AI Agent 的记忆仓库

面向 AI Agent 的中心化记忆仓库，支持多用户、多知识库、公共记忆与细粒度权限管理。

## 痛点与痒点

### 痛点（传统方式）

- **规则漂移**：同一规则在不同成员本地长期漂移，导致结果不一致。
- **维护成本高**：每次规则更新都要逐人同步，且难确认是否真正生效。
- **审计困难**：缺少统一版本与变更入口，难回答“当前到底执行了哪套规则”。

### 痒点（中心化收益）

- **一次维护，全员复用**：规则统一更新后即可被多 Agent 共享。
- **跨会话稳定**：规则不依赖个人本地状态，降低“会话失效”概率。
- **可追溯可治理**：规则、权限、审查结论都可在组织层面统一管理。

### 与传统“每人本地 Agent 独立配规则”的核心区别

| 维度 | 传统方式（每人本地配置） | MemHub（中心化管理） |
|---|---|---|
| 规则来源 | 分散在个人本地文件，版本不一致 | 统一沉淀在知识库，版本可控 |
| 规则生效 | 换 Agent/换会话/换机器容易失效 | 通过统一入口检索，跨 Agent 一致生效 |
| 团队协作 | 口径依赖个人习惯，难统一 | 组织级规则统一下发，口径一致 |
| 权限治理 | 难做精细授权，边界模糊 | Owner/Admin/Write/Read 分级治理 |
| 审查沉淀 | 结论留在聊天记录，难复用 | 结论可回写知识库，形成闭环 |

## 功能特性

- **用户系统**：注册、登录、JWT 认证
- **知识库管理**：每个用户可创建多个知识库，支持公开/私有
- **权限管理**：Owner / Admin / Write / Read 四级权限
- **文档管理**：上传或新建 Markdown 规则文档，保留原文供 Agent 渐进式披露检索
- **公共记忆**：支持写入、查询与清理跨 Agent 共享记忆
- **智能问答**：基于知识库原文的问答，规则文档优先注入上下文
- **Agent 一键接入**：复制 Agent 提示词，即可让你的 Agent 自动接入 MemHub 知识库检索

## 技术栈

- **后端**：FastAPI + SQLAlchemy + PostgreSQL + pgvector
- **前端**：React + TypeScript + Vite + Tailwind CSS
- **RAG / Memory**：LangChain + OpenAI（规则原文问答、公共记忆向量检索）

## 一键安装（推荐）

已安装 Docker 时，执行以下命令将自动安装全部环境并启动 MemHub：

```bash
curl -fsSL https://raw.githubusercontent.com/liam798/MemHub/main/scripts/install.sh | bash
```

安装完成后访问：
- 前端：`http://localhost:3100`
- 后端：`http://localhost:18000`

## 参与贡献

当前推荐的协作方式是：

1. 在你自己的 fork 中开发
2. 从 `main` 拉出短期功能分支
3. 完成修改后推送到你的 fork
4. 在 GitHub 上向主仓库 `main` 发起 Pull Request

建议不要长期维护 `dev` 等集成分支；除 `main` 外，其余分支都应为短期分支。

### 分支与提交流程

```bash
git checkout main
git pull origin main
git checkout -b feature/update-readme
```

完成修改后：

```bash
git status
git add <files>
git commit -m "补充贡献指南"
git push origin feature/update-readme
```

随后在 GitHub 页面发起 Pull Request：

- source：你的 fork 分支
- target：主仓库 `main`

### 提交建议

- 每次提交只做一件相对完整的事情
- 提交信息尽量直接描述结果
- 避免把无关格式化、调试代码和临时文件混入提交
- 如修改 API、脚本、文档或页面文案，请同步更新对应说明

### 提交前自检

前端构建：

```bash
cd frontend
npm run build
```

后端测试：

```bash
cd backend
python -m pytest
```

说明：

- 当前仓库未单独提供后端开发依赖清单；若本地缺少 `pytest`，请先自行安装
- 如果改动依赖 OpenAI 或数据库，请在 PR 中说明你的验证方式
- 如果未运行某项检查，请在 PR 描述中写明原因

### 文档同步要求

如果代码行为发生变化，请同步检查这些文件是否需要更新：

- `README.md`
- `SKILL.md`
- `scripts/` 下启动和部署脚本中的提示文案

## Mission Control 子项目

- 已将上游 `crshdn/mission-control` 源码纳入仓库目录：`mission-control/`
- MemHub 顶栏中的 `Mission Control` 按钮默认跳转到 `http://localhost:4000`
- 启动方式：在仓库根目录执行 `docker compose up -d --build mission-control`，或进入 `mission-control/` 单独运行
- 已配置上游 remote：`mission-control-upstream`
- 后续同步上游更新可执行：`git fetch mission-control-upstream && git subtree pull --prefix=mission-control mission-control-upstream main --squash`

## 规划文档

- `docs/memhub-v2-agent-control-plane.md`：MemHub v2 产品定位、企业级 Agent 基础架构图、分阶段落地路线图
- `docs/memhub-agent-profile-runtime-design.md`：AgentProfile / AgentRuntime 分层设计、Mission Control 改版方案、API 草案

## 源码开发（本机运行）

### 环境要求

- Python 3.10+
- PostgreSQL 14+ (需安装 pgvector 扩展)
- Node.js 18+

### 后端启动

```bash
cd backend
cp .env.example .env  # 配置数据库与 OpenAI API Key
# 如果直接在本机运行 PostgreSQL 映射 5532 端口，请将 .env 中的 DATABASE_URL 替换为 localhost:5532
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

### 前端启动

```bash
cd frontend
npm install
npm run dev
```

### 数据库初始化

确保 PostgreSQL 已安装 pgvector：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 项目结构

```
MemHub/
├── backend/          # FastAPI 后端
│   ├── app/
│   │   ├── api/      # API 路由
│   │   ├── core/     # 配置、安全
│   │   ├── models/   # 数据模型
│   │   ├── schemas/  # Pydantic 模式
│   │   ├── services/ # 业务逻辑
│   │   └── rag/      # RAG 管道
│   └── alembic/      # 数据库迁移
├── frontend/         # React 前端
├── scripts/          # 一键安装与启动脚本
├── SKILL.md          # Agent Skill 说明
└── README.md
```

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/register | 用户注册 |
| POST | /api/auth/login | 用户登录 |
| GET | /api/auth/api-key | 获取或创建 API Key |
| POST | /api/auth/api-key/regenerate | 重新生成 API Key |
| GET | /api/auth/me | 当前用户信息 |
| GET | /api/knowledge-bases | 我的知识库列表 |
| POST | /api/knowledge-bases | 创建知识库 |
| GET | /api/knowledge-bases/{id} | 知识库详情 |
| PATCH | /api/knowledge-bases/{id} | 更新知识库 |
| DELETE | /api/knowledge-bases/{id} | 删除知识库 |
| GET | /api/knowledge-bases/{id}/documents | 文档列表 |
| GET | /api/knowledge-bases/{id}/documents/{doc_id} | 文档详情（含正文） |
| POST | /api/knowledge-bases/{id}/documents | 上传 Markdown 文档 |
| POST | /api/knowledge-bases/{id}/documents/create | 新建文档 |
| PATCH | /api/knowledge-bases/{id}/documents/{doc_id} | 更新文档 |
| DELETE | /api/knowledge-bases/{id}/documents/{doc_id} | 删除文档 |
| GET | /api/knowledge-bases/{id}/members | 成员列表 |
| POST | /api/knowledge-bases/{id}/members | 添加成员 |
| PATCH | /api/knowledge-bases/{id}/members/{user_id} | 更新成员角色 |
| DELETE | /api/knowledge-bases/{id}/members/{user_id} | 移除成员 |
| POST | /api/knowledge-bases/{id}/query | 单知识库问答 |
| POST | /api/knowledge-bases/query | 多知识库问答 |
| POST | /api/knowledge-bases/{id}/memory | 写入公共记忆 |
| POST | /api/knowledge-bases/{id}/memory/query | 查询公共记忆 |
| POST | /api/knowledge-bases/{id}/memory/cleanup | 清理过期公共记忆 |
| GET | /health/live | 存活探针 |
| GET | /health/ready | 就绪探针（含数据库探活） |
| GET | /health/openai | OpenAI 连通性检查（curl） |
| GET | /health/openai-rag | OpenAI 连通性检查（httpx/RAG 路径） |

**API Key**：调用需认证的接口时使用（用户菜单 → API Key）。Agent 接入详见项目根目录 `SKILL.md`。

## 可靠性与运维建议

- 默认关闭破坏性迁移（`ALLOW_DESTRUCTIVE_MIGRATIONS=false`），防止初始化或升级时误清空数据。
- 建议将 `ALLOWED_ORIGINS` 显式配置为前端域名列表，生产环境避免使用 `*`。
- 可通过 `REQUEST_TIMEOUT_SECONDS` 控制接口超时保护；响应会返回 `X-Request-ID` 与 `X-Process-Time-Ms` 便于排障。
- 当前知识库文档问答基于规则文档原文，不走普通文档向量检索；公共记忆接口仍使用 pgvector 做语义召回。
- 文档上传受 `MAX_UPLOAD_FILE_SIZE_MB` 与文件类型白名单限制，当前仅支持 `.md`。
- 公开知识库仅允许系统管理员创建或切换；普通用户只能创建私有知识库。
