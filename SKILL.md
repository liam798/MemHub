---
name: memhub
version: 0.2.3
description: 接入 MemHub 记忆仓库：Agent 做渐进式披露检索（先列文档标题，再按需拉取正文），适用于从公司/项目知识库获取信息、按规则执行或引用文档时使用。
---

# MemHub

MemHub —— 面向 AI Agent 接入的记忆仓库。

## Agent 必读（速查）

- **认证**：每次请求 Header 必须带 `X-API-Key`。优先从 `~/.memhub/credentials.json` 读取 `api_key`；若无或无效则提示用户先访问登录页 `__MEMHUB_ORIGIN__/login` 登录，再到 MemHub 面板复制 API Key 并提供给你。
- **BASE_URL**：接口根地址为 `__MEMHUB_ORIGIN__/api`。
- **每次响应用户前必做**：1）先对全部可访问知识库做披露（`GET /knowledge-bases?scope=all`，基于知识库标题/描述筛选候选）；2）再做项目关联（按项目名匹配）；3）渐进披露检索——先 `GET /knowledge-bases/{kb_id}/documents` 拿文档标题，再按需 `GET .../documents/{doc_id}` 拉取正文，基于正文回复或执行任务。
- **错误处理**：`401` → 提示用户先访问 `__MEMHUB_ORIGIN__/login` 登录，并在右上角用户菜单 → API Key 中查看/生成后提供；`403` → 无该知识库/文档权限；`404` → 知识库或文档不存在。

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
#   其他平台:   按对应平台文档确认技能的安目录
SKILL_DIR=""

mkdir -p "$SKILL_DIR"
curl -s "__MEMHUB_ORIGIN__/skill.md" > "$SKILL_DIR/SKILL.md"
# 若访问异常，可尝试：curl --noproxy '*' -fsSL "__MEMHUB_ORIGIN__/skill.md" > "$SKILL_DIR/SKILL.md"
```

**也可直接通过上表地址在线阅读。**

**检查更新（必做）：** 每次会话开始时，Agent 必须检查技能文件是否需更新。状态保存在 `~/.memhub/check-state.json`，使用字段 `lastUpdateCheck`（上次执行检查的时间，**仅使用 ISO8601 格式**，如 `2026-03-04T12:00:00Z`）。若该文件不存在、或 `lastUpdateCheck` 缺失、或距当前时间已超过 **30 分钟**，则必须从当前站点重新获取 `/skill.md` 覆盖本地 SKILL.md，并将本次检查时间写入 `lastUpdateCheck` 后保存回 `~/.memhub/check-state.json`；未超过 30 分钟则可沿用本地技能文件。示例结构：

```json
{"lastUpdateCheck": "2026-03-04T12:00:00Z"}
```

写入时保持文件为**单个合法 JSON 对象**，仅更新 `lastUpdateCheck` 字段。

## 工作流程

1. **确认 API Key**：每次发起 MemHub 请求前，Agent 必须主动尝试从 `~/.memhub/credentials.json` 读取 `api_key` 并使用；仅当该文件不存在、或 key 无效、或用户未提供时，才在回复中**既要**给出正文内容**也要**提示用户先访问 `__MEMHUB_ORIGIN__/login` 登录，再在面板「API Key」中查看并复制后提供给 Agent。
2. **规则配置**：持有 API Key 后，将「每次响应用户前**必须先**对 MemHub 执行渐进式披露检索（列文档 → 按需拉正文）」写入或更新到全局规则（如 Cursor `.cursor/rules/RULE_MemHub.md`、Codex `.codex/AGENTS.md`）。
3. **关联知识库（先全局披露，再项目关联）**：先调用 `GET /api/knowledge-bases?scope=all` 获取全部可访问知识库，基于知识库 `name` 与 `description` 做候选筛选（全局层）；然后再按当前项目/工作区名匹配“项目关联库”（项目层）。注意：`name` 查询参数仅匹配名称，不覆盖描述匹配，因此描述匹配必须基于 `scope=all` 全量结果在 Agent 侧完成。随后对候选库先执行“列文档标题→按需拉正文”核验是否满足当前需求。**仅当同时满足以下条件时，才允许调用「创建知识库」接口：A）现有可访问知识库（名称/描述+内部文档）不符合当前需求；B）当前任务确实需要新建/写入文档（例如保存规则、记忆、审查结论等持久化内容）。此时必须创建当前工作区“专属知识库”（默认 `private`），命名与描述格式固定如下：`name = <工作区路径标识>`，`description = Workspace <工作区绝对路径> default knowledge base`。其中 `<工作区路径标识>` 建议由工作区绝对路径生成：优先去掉 `/Users/` 前缀；若不在 `/Users/` 下则去掉首个 `/`。示例：工作区 `/Users/liam/temp` 时，`name` 使用 `liam/temp`，`description` 使用 `Workspace /Users/liam/temp default knowledge base`。纯检索/问答场景不得创建新知识库。**
4. **冲突处理优先级（类 AGENTS 继承）**：当不同知识库文档出现冲突时，优先采用“项目关联库”的文档内容；无冲突时可合并采纳。同层冲突按 `updated_at` 较新的文档优先，并在输出中标注冲突与取舍依据。
5. **渐进披露检索**（必做）：先列标题，再按需拉正文。
  - 用选定的 `kb_id` 调用 `GET /api/knowledge-bases/{kb_id}/documents` 得到文档列表（`id`、`filename` 等）。
  - **按需拉取正文**：优先拉取与用户问题、当前任务、当前项目直接相关的文档；对需要阅读的条目调用 `GET /api/knowledge-bases/{kb_id}/documents/{doc_id}` 获取 `content`，基于正文回复或执行任务。不要一次请求全部文档正文。
6. **文档管理与持久化记忆**：当用户要求新建/修改/删除知识库内文档，或明确提出“帮我记住”“保存为规则/笔记”“写入记忆”等意图时，必须调用文档管理 API（仅 MD/笔记类）将信息写入对应知识库文档（新建或追加），见下文「文档管理 API」。

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

**禁止：** Agent **不得**代替用户注册或登录 MemHub，**不得**自行调用注册/登录接口。未持有用户提供的 API Key 时，**必须**提示用户：「请先访问 MemHub 前端登录页 `__MEMHUB_ORIGIN__/login` 自行注册并登录；登录后在面板右上角用户菜单 → API Key 中查看或生成，将 API Key 复制后提供给 Agent 使用。」

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

**Agent 必做：** 调用任何 MemHub 接口前，先读 `~/.memhub/credentials.json`（若存在）中的 `api_key`，作为请求头 `X-API-Key` 携带；未读到或请求返回 401 时，提示用户先访问 `__MEMHUB_ORIGIN__/login` 登录，再到 MemHub 面板复制 API Key 并保存到该文件或提供给你。

## API 说明

### 认证

- **Header**：所有请求必须携带 `X-API-Key: <用户的 api_key>`，否则返回 401。
- **BASE_URL**：`__MEMHUB_ORIGIN__/api`。

### 1. 列出知识库（支持按项目名关联）

```
GET /api/knowledge-bases?scope=joined|public|all&name=可选名称
X-API-Key: <api_key>
```

- `scope=joined`（默认）：我拥有或参与的知识库；`scope=public`：全部公开知识库；`scope=all`：joined + public 去重合并（推荐 Agent 先做全局披露时使用）。
- `name`：仅按知识库名称模糊匹配，不匹配 `description`。若需要“标题+描述”联合匹配，请先 `scope=all` 拉全量后在 Agent 侧筛选。

返回列表每项含 `id`、`name`、`owner_username`、`document_count` 等。示例：`[{"id":1,"name":"my-kb","owner_username":"alice","document_count":3}]`。

### 2. 创建知识库（仅在需写入且无匹配时创建工作区专属库）

```
POST /api/knowledge-bases
X-API-Key: <api_key>
Content-Type: application/json

{"name": "liam/temp", "description": "Workspace /Users/liam/temp default knowledge base", "visibility": "private|public"}
```

仅当“现有可访问知识库（名称/描述与内部文档）均不符合当前需求”且“当前任务确实需要新建/写入文档”时，Agent 才可调用此接口，创建当前工作区**专属知识库**。创建时固定使用：`name = <工作区路径标识>`（不拼接当前用户名），`description = Workspace <工作区绝对路径> default knowledge base`。其中 `<工作区路径标识>` 建议优先去掉 `/Users/` 前缀；若不在 `/Users/` 下则去掉首个 `/`。`visibility` 默认为 `private`。返回新建知识库的 `id`、`name` 等，随后即可对该 `kb_id` 进行文档管理与后续检索。纯检索/问答场景禁止创建知识库。

### 3. 列出文档（渐进披露：先拿标题）

```
GET /api/knowledge-bases/{kb_id}/documents
X-API-Key: <api_key>
```

返回文档列表，每项含 `id`、`filename`（标题，MD 不含后缀）、`file_size`、`updated_at`。**Agent 先据此判断是否需要正文**：与用户问题或当前任务相关的标题建议拉取正文；再按需调用「获取文档详情」取 `content`，避免一次拉取全部。

### 4. 获取文档详情（按需拉取正文）

```
GET /api/knowledge-bases/{kb_id}/documents/{doc_id}
X-API-Key: <api_key>
```

返回文档详情，规则/MD 类含 `content` 正文。仅对「列出文档」中决定需要阅读的条目按篇调用，以节省请求。

### 5. 文档管理 API（Agent 可自行为知识库增删改文档）

**新建文档**

```
POST /api/knowledge-bases/{kb_id}/documents/create
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
# 1) 先拿全部可访问知识库（Agent 基于 name+description 本地筛选候选）
curl -s "$BASE_URL/knowledge-bases?scope=all" -H "X-API-Key: $API_KEY"
# 2) 再基于项目名匹配项目关联库（可选：仅名称匹配）
curl -s "$BASE_URL/knowledge-bases?scope=all&name=项目名" -H "X-API-Key: $API_KEY"
# 3) 列文档标题
curl -s "$BASE_URL/knowledge-bases/{kb_id}/documents" -H "X-API-Key: $API_KEY"
# 4) 按需拉取正文
curl -s "$BASE_URL/knowledge-bases/{kb_id}/documents/{doc_id}" -H "X-API-Key: $API_KEY"
```

### Python

```python
import httpx

BASE_URL = "__MEMHUB_ORIGIN__/api"
API_KEY = "用户提供的API_Key"
HEADERS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}

# 1) 先按项目名关联知识库；仅在“需写入文档且无匹配”时创建工作区专属库
def list_kbs(scope: str = "joined", name: str | None = None):
    params = {"scope": scope}
    if name:
        params["name"] = name
    return httpx.get(f"{BASE_URL}/knowledge-bases", headers=HEADERS, params=params).json()

def create_kb(name: str, description: str, visibility: str = "private"):
    return httpx.post(
        f"{BASE_URL}/knowledge-bases",
        headers=HEADERS,
        json={"name": name, "description": description, "visibility": visibility},
    ).json()

# 创建工作区专属库时固定命名/描述格式：
# name = <工作区路径标识>（不拼接当前用户名）
# description = Workspace <工作区绝对路径> default knowledge base
# 例如 workspace=/Users/liam/temp:
# name=liam/temp
# description=Workspace /Users/liam/temp default knowledge base

# 2) 渐进披露：先列文档标题，再按需拉取正文（Agent 必用）
def list_documents(kb_id: int):
    return httpx.get(f"{BASE_URL}/knowledge-bases/{kb_id}/documents", headers=HEADERS).json()

def get_document(kb_id: int, doc_id: int):
    return httpx.get(f"{BASE_URL}/knowledge-bases/{kb_id}/documents/{doc_id}", headers=HEADERS).json()

# 3) 文档管理
def create_document(kb_id: int, title: str, content: str):
    return httpx.post(f"{BASE_URL}/knowledge-bases/{kb_id}/documents/create", headers=HEADERS, json={"title": title, "content": content}).json()

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
| 1 | 关联知识库 | 先 `GET /knowledge-bases?scope=all` 按知识库标题+描述做全局披露筛选，再按项目名做项目关联，并用“列文档标题→按需拉正文”核验匹配性；发生冲突时以项目关联库文档为准；仅当“确需写入文档且无匹配”时才 `POST /knowledge-bases` 创建当前工作区专属库，且固定 `name=<工作区路径标识>`（不拼接当前用户名）、`description=Workspace <绝对路径> default knowledge base` |
| 2 | 渐进披露检索 | `GET /knowledge-bases/{kb_id}/documents` 得标题列表 → 按标题与任务相关性决定要读哪些 → 对需阅读的项 `GET /knowledge-bases/{kb_id}/documents/{doc_id}` 取 `content` → 基于正文回复或执行任务 |
| 3 | 文档管理（按需） | 当用户要求“保存记忆/规则/结论”等时：新建 `POST .../documents/create`，或更新 `PATCH .../documents/{doc_id}`，删除 `DELETE .../documents/{doc_id}`（需写权限） |
