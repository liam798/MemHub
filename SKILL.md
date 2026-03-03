---
name: memhub
version: 0.2.2
description: 接入 MemHub 记忆仓库：Agent 做渐进式披露检索（先列文档标题，再按需拉取正文），适用于从公司/项目知识库获取信息、按规则执行或引用文档时使用。
---

# MemHub

MemHub —— 面向 AI Agent 接入的记忆仓库。

## Agent 必读（速查）

- **认证**：每次请求 Header 必须带 `X-API-Key`。优先从 `~/.memhub/credentials.json` 读取 `api_key`；若无或无效则提示用户到 MemHub 面板复制 API Key 并提供给你。
- **BASE_URL**：接口根地址为 `{MemHub 前端域名}/api`，例如 `https://memhub.example.com/api`。本地开发多为 `http://localhost:3000/api`（前端代理到后端）。
- **每次响应用户前必做**：1）按项目/工作区名关联知识库（`GET /knowledge-bases?name=...`，无则创建）；2）渐进披露检索——先 `GET /knowledge-bases/{kb_id}/documents` 拿文档标题，再按需 `GET .../documents/{doc_id}` 拉取正文，基于正文回复或执行任务。**不调用 RAG 问答接口。**
- **错误处理**：`401` → 提示用户配置 API Key；`403` → 无该知识库/文档权限；`404` → 知识库或文档不存在。

## 技能文件

| 文件 | 地址 |
|------|------|
| **SKILL.md**（本文件） | 当前站点 `/skill.md`（完整地址即你访问 MemHub 前端的域名 + `/skill.md`） |

**本地安装（Agent 请下载到本地使用）：**

```bash
# 将 SKILL_DIR 赋值为你当前使用的 Agent 技能安装目录，例如：
#   Cursor:     ~/.cursor/skills/memhub
#   Codex:      ~/.codex/skills/memhub
#   OpenClaw:   ~/.openclaw/skills/memhub
#   其他平台:   按该平台文档配置的技能目录
SKILL_DIR="${SKILL_DIR:-$HOME/.cursor/skills/memhub}"

mkdir -p "$SKILL_DIR"
curl -s "__MEMHUB_ORIGIN__/skill.md" > "$SKILL_DIR/SKILL.md"
# 若访问异常，可尝试：curl --noproxy '*' -fsSL "__MEMHUB_ORIGIN__/skill.md" > "$SKILL_DIR/SKILL.md"
```

**也可直接通过上表地址在线阅读。**

**检查更新：** 随时重新获取该文件以查看新功能。

## 工作流程

1. **确认 API Key**：每次发起 MemHub 请求前，Agent 必须主动尝试从 `~/.memhub/credentials.json` 读取 `api_key` 并使用；仅当该文件不存在、或 key 无效、或用户未提供时，才在回复中**既要**给出正文内容**也要**提示用户登录 MemHub、在面板「API Key」中查看并复制后提供给 Agent。
2. **规则配置**：持有 API Key 后，将「每次响应用户前**必须先**对 MemHub 执行渐进式披露检索（列文档 → 按需拉正文），不调用 RAG 问答」写入或更新到全局规则（如 Cursor `.cursor/rules/RULE_MemHub.md`、Codex `.codex/AGENTS.md`）。
3. **关联知识库**：根据当前项目/工作区名称自动关联知识库。先调用 `GET /api/knowledge-bases?name={项目名}`（如 `name=android` 可匹配 `liam/android`）；若无结果再调用 `GET /api/knowledge-bases` 取全部可访问知识库并按名称匹配。**若仍无匹配，Agent 可自动调用「创建知识库」接口，以当前项目/工作区名称为 `name` 创建新知识库（默认私有），再继续后续检索与文档管理。**
4. **渐进披露检索**（必做）：先列标题，再按需拉正文。
   - 用选定的 `kb_id` 调用 `GET /api/knowledge-bases/{kb_id}/documents` 得到文档列表（`id`、`filename`、`is_rule` 等）。
   - **按需拉取正文**：与用户问题或任务相关的文档、或 `is_rule=true` 的规则建议拉取；对需要阅读的条目调用 `GET /api/knowledge-bases/{kb_id}/documents/{doc_id}` 获取 `content`，基于正文回复或执行任务。不要一次请求全部文档正文。
5. **文档管理与持久化记忆**：当用户要求新建/修改/删除知识库内文档，或明确提出“帮我记住”“保存为规则/笔记”“写入记忆”等意图时，必须调用文档管理 API（仅 MD/笔记类）将信息写入对应知识库文档（新建或追加），见下文「文档管理 API」。

## 输出规范

当输出内容包含以下场景时，**来自 MemHub 知识库的内容必须单独成章/成节输出**，不要与常规内容混写在一起。

- **Review 场景**：当有需要整改的内容时（当无整改项，不做任何额外的输出），在整体 Review 报告中追加一个小节，标题为「按 MemHub 知识库规则需整改：」。该小节只列出**依据知识库规则判断需要整改**的条目，不必罗列已符合或与本次任务无关的规则。每条按以下格式说明：
  - **《规则文档名》** 具体规则/要求 → 当前问题或现象（可带路径、命令、报错等）→ **建议**：具体整改动作。
  
  **示例**：
  ```
  按 MemHub 知识库规则需整改：
  - 《通用项目 Review 规则.md》 版本管理要求 → 当前工作区 /Users/liam/temp 执行 git status 报 "not a git repository" → 建议：立即在该目录运行 git init 或接入既有仓库，确保符合版本管理规范。
  ```

## 获取 API Key

**禁止：** Agent **不得**代替用户注册或登录 MemHub，**不得**自行调用注册/登录接口。未持有用户提供的 API Key 时，**必须**提示用户：「请先访问 MemHub 前端自行注册并登录，在面板右上角用户菜单 → API Key 中查看或生成，将 API Key 复制后提供给 Agent 使用。」

### 1. 注册与登录

由**用户本人**在浏览器访问 MemHub 前端完成注册和登录，Agent 仅接收用户复制来的 API Key。

### 2. 在面板查看 API Key

登录后，点击右上角用户名 → **API Key**，即可查看或生成 API Key。将 API Key 复制给 Agent 使用。

**⚠️ 请立即保存你的 `api_key`！** 后续所有请求都会用到它。

**推荐做法：** 将凭据保存到 `~/.memhub/credentials.json`，Agent 会在每次请求前**主动读取**该文件中的 `api_key`：

```json
{
  "api_key": "xxx"
}
```

> 该文件必须是**单个合法 JSON 对象**。若文件已存在，请更新其中的 `api_key` 字段，而不是在文件末尾继续追加第二个 `{ "api_key": "xxx" }`，避免出现 `{...}{...}` 这类无法解析的内容。

**Agent 必做：** 调用任何 MemHub 接口前，先读 `~/.memhub/credentials.json`（若存在）中的 `api_key`，作为请求头 `X-API-Key` 携带；未读到或请求返回 401 时，提示用户到 MemHub 面板复制 API Key 并保存到该文件或提供给你。

## API 说明

### 认证

- **Header**：所有请求必须携带 `X-API-Key: <用户的 api_key>`，否则返回 401。
- **BASE_URL**：`__MEMHUB_ORIGIN__/api`。

### 1. 列出知识库（支持按项目名关联）

```
GET /api/knowledge-bases?scope=joined|public&name=可选名称
X-API-Key: <api_key>
```

- `scope=joined`（默认）：我拥有或参与的知识库；`scope=public`：全部公开知识库。
- `name`：模糊匹配知识库名称（不区分大小写），用于 Agent 根据项目名关联，例如 `name=android` 可匹配 `liam/android`。

返回列表每项含 `id`、`name`、`owner_username`、`document_count` 等。示例：`[{"id":1,"name":"my-kb","owner_username":"alice","document_count":3}]`。

### 2. 创建知识库（按项目名自动创建）

```
POST /api/knowledge-bases
X-API-Key: <api_key>
Content-Type: application/json

{"name": "知识库名称（如项目/工作区名）", "description": "可选描述", "visibility": "private|public"}
```

当按项目名未匹配到任何知识库时，Agent 可调用此接口以当前项目/工作区名称创建知识库。`visibility` 默认为 `private`。返回新建知识库的 `id`、`name` 等，随后即可对该 `kb_id` 进行渐进披露检索与文档管理。

### 3. 列出文档（渐进披露：先拿标题）

```
GET /api/knowledge-bases/{kb_id}/documents
X-API-Key: <api_key>
```

返回文档列表，每项含 `id`、`filename`（标题，MD 不含后缀）、`file_size`、`updated_at`、`is_rule`。**Agent 先据此判断是否需要正文**：与用户问题或当前任务相关的标题、或 `is_rule=true` 的规则类文档建议拉取正文；再按需调用「获取文档详情」取 `content`，避免一次拉取全部。

### 4. 获取文档详情（按需拉取正文）

```
GET /api/knowledge-bases/{kb_id}/documents/{doc_id}
X-API-Key: <api_key>
```

返回文档详情，规则/MD 类含 `content` 正文。仅对「列出文档」中决定需要阅读的条目按篇调用，以节省请求。

### 5. 文档管理 API（Agent 可自行为知识库增删改文档）

**新建文档（笔记/MD）**

```
POST /api/knowledge-bases/{kb_id}/rules
X-API-Key: <api_key>
Content-Type: application/json

{"title": "文档标题（可含 .md）", "content": "正文，支持 Markdown"}
```

**更新文档**

```
PATCH /api/knowledge-bases/{kb_id}/documents/{doc_id}
X-API-Key: <api_key>
Content-Type: application/json

{"title": "新标题（可选）", "content": "新正文（可选）"}
```

**删除文档**

```
DELETE /api/knowledge-bases/{kb_id}/documents/{doc_id}
X-API-Key: <api_key>
```

说明：当前仅支持 MD/笔记类文档的增删改；上传文件为 `POST /api/knowledge-bases/{kb_id}/documents`（multipart/form-data，仅 .md）。认证与权限：同上；无写权限的知识库返回 403。

## 调用示例

### curl（渐进披露检索）

```bash
BASE_URL="__MEMHUB_ORIGIN__/api"
API_KEY="用户提供的API_Key"
# 1) 按项目名关联知识库
curl -s "$BASE_URL/knowledge-bases?scope=joined&name=项目名" -H "X-API-Key: $API_KEY"
# 2) 列文档标题
curl -s "$BASE_URL/knowledge-bases/{kb_id}/documents" -H "X-API-Key: $API_KEY"
# 3) 按需拉取正文
curl -s "$BASE_URL/knowledge-bases/{kb_id}/documents/{doc_id}" -H "X-API-Key: $API_KEY"
```

### Python

```python
import httpx

BASE_URL = "__MEMHUB_ORIGIN__/api"
API_KEY = "用户提供的API_Key"
HEADERS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}

# 1) 按项目名关联知识库，若无则创建
def list_kbs(scope: str = "joined", name: str | None = None):
    params = {"scope": scope}
    if name:
        params["name"] = name
    return httpx.get(f"{BASE_URL}/knowledge-bases", headers=HEADERS, params=params).json()

def create_kb(name: str, description: str = "", visibility: str = "private"):
    return httpx.post(
        f"{BASE_URL}/knowledge-bases",
        headers=HEADERS,
        json={"name": name, "description": description, "visibility": visibility},
    ).json()

# 2) 渐进披露：先列文档标题，再按需拉取正文（Agent 必用，不调用 RAG）
def list_documents(kb_id: int):
    return httpx.get(f"{BASE_URL}/knowledge-bases/{kb_id}/documents", headers=HEADERS).json()

def get_document(kb_id: int, doc_id: int):
    return httpx.get(f"{BASE_URL}/knowledge-bases/{kb_id}/documents/{doc_id}", headers=HEADERS).json()

# 3) 文档管理
def create_document(kb_id: int, title: str, content: str):
    return httpx.post(f"{BASE_URL}/knowledge-bases/{kb_id}/rules", headers=HEADERS, json={"title": title, "content": content}).json()

def update_document(kb_id: int, doc_id: int, title: str | None = None, content: str | None = None):
    body = {}
    if title is not None: body["title"] = title
    if content is not None: body["content"] = content
    return httpx.patch(f"{BASE_URL}/knowledge-bases/{kb_id}/documents/{doc_id}", headers=HEADERS, json=body)

def delete_document(kb_id: int, doc_id: int):
    return httpx.delete(f"{BASE_URL}/knowledge-bases/{kb_id}/documents/{doc_id}", headers=HEADERS)
```

## Agent 检索与文档管理（简明流程）

| 步骤 | 动作 | 说明 |
|------|------|------|
| 1 | 关联知识库 | `GET /knowledge-bases?name={项目名}`，无则 `GET /knowledge-bases` 全列表按名匹配；仍无则 `POST /knowledge-bases` 创建，用返回的 `id` 作为 `kb_id` |
| 2 | 渐进披露检索 | `GET /knowledge-bases/{kb_id}/documents` 得标题列表 → 按标题/`is_rule` 决定要读哪些 → 对需阅读的项 `GET /knowledge-bases/{kb_id}/documents/{doc_id}` 取 `content` → 基于正文回复或执行任务 |
| 3 | 文档管理（按需） | 当用户要求“保存记忆/规则/结论”等时：新建 `POST .../rules`，或更新 `PATCH .../documents/{doc_id}`，删除 `DELETE .../documents/{doc_id}`（需写权限） |
