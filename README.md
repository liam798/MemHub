# MemHub - 面向 AI Agent 的记忆仓库

类似 GitHub 仓库概念的 RAG 知识库系统，支持多用户、多知识库与细粒度权限管理。

## 功能特性

- **用户系统**：注册、登录、JWT 认证
- **知识库管理**：每个用户可创建多个知识库，支持公开/私有
- **权限管理**：Owner / Admin / Write / Read 四级权限
- **文档管理**：上传文档，自动分块与向量化
- **智能检索**：基于 RAG 的问答，支持语义搜索
- **Agent 一键接入**：复制 Agent 提示词，即可让你的 Agent 自动接入 MemHub 知识库检索

## 技术栈

- **后端**：FastAPI + SQLAlchemy + PostgreSQL + pgvector
- **前端**：React + TypeScript + Tailwind CSS
- **RAG**：LangChain + OpenAI Embeddings

## 一键安装

已安装 Docker 时，执行以下命令将自动安装环境并启动 MemHub：

```bash
curl -fsSL https://raw.githubusercontent.com/liam798/MemHub/main/scripts/install.sh | bash
```

## 源码开发

### 环境要求

- Python 3.10+
- PostgreSQL 14+ (需安装 pgvector 扩展)
- Node.js 18+

### 后端启动

```bash
cd backend
cp .env.example .env  # 配置数据库与 OpenAI API Key
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
| GET | /api/auth/me | 当前用户信息 |
| GET | /api/knowledge-bases | 我的知识库列表 |
| POST | /api/knowledge-bases | 创建知识库 |
| GET | /api/knowledge-bases/{id} | 知识库详情 |
| GET | /api/knowledge-bases/{id}/documents | 文档列表 |
| GET | /api/knowledge-bases/{id}/documents/{doc_id} | 文档详情（含正文） |
| POST | /api/knowledge-bases/{id}/documents | 上传文档 |
| POST | /api/knowledge-bases/{id}/documents/create | 新建文档 |
| PATCH | /api/knowledge-bases/{id}/documents/{doc_id} | 更新文档 |
| DELETE | /api/knowledge-bases/{id}/documents/{doc_id} | 删除文档 |
| GET | /api/knowledge-bases/{id}/members | 成员列表 |
| POST | /api/knowledge-bases/{id}/members | 添加成员 |
| GET | /health/live | 存活探针 |
| GET | /health/ready | 就绪探针（含数据库探活） |

**API Key**：调用需认证的接口时使用（用户菜单 → API Key）。Agent 接入详见项目根目录 `SKILL.md`。

## 可靠性与运维建议

- 默认关闭破坏性迁移（`ALLOW_DESTRUCTIVE_MIGRATIONS=false`），防止初始化或升级时误清空数据。
- 建议将 `ALLOWED_ORIGINS` 显式配置为前端域名列表，生产环境避免使用 `*`。
- 可通过 `REQUEST_TIMEOUT_SECONDS` 控制接口超时保护；响应会返回 `X-Request-ID` 与 `X-Process-Time-Ms` 便于排障。
- 文档上传受 `MAX_UPLOAD_FILE_SIZE_MB` 与文件类型白名单限制（txt/md/pdf/docx）。
