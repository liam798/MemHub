import { lazy, Suspense, useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import { kbApi, KnowledgeBase as KB, Document, Member } from "../api/knowledgeBase";
import { usersApi } from "../api/users";
import { useAuth } from "../context/AuthContext";

const MarkdownEditor = lazy(() => import("@uiw/react-md-editor"));
const MarkdownPreview = lazy(async () => {
  const module = await import("@uiw/react-md-editor");
  return { default: module.default.Markdown };
});

function stripFrontMatterForPreview(content: string): string {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return content;
  const frontMatterBody = match[1] ?? "";
  const hasYamlKeyValue = frontMatterBody
    .split(/\r?\n/)
    .some((line) => /^[A-Za-z0-9_-]+\s*:\s*.+$/.test(line.trim()));
  return hasYamlKeyValue ? content.slice(match[0].length) : content;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUpdatedAt(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

const IconDownload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const IconTrash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);
const IconFolder = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);
const IconUsers = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconPencil = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

export default function KnowledgeBase() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const kbId = parseInt(id || "0", 10);
  const [kb, setKb] = useState<KB | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"files" | "members">("files");
  const [members, setMembers] = useState<Member[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [addUserQuery, setAddUserQuery] = useState("");
  const [searchUsers, setSearchUsers] = useState<{ id: number; username: string; email: string }[]>([]);
  const [addRole, setAddRole] = useState<"read" | "write" | "admin">("read");
  const [addingMember, setAddingMember] = useState(false);
  const { user: currentUser } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteDocId, setNoteDocId] = useState<number | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [creatingNote, setCreatingNote] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewDocId, setViewDocId] = useState<number | null>(null);
  const [viewTitle, setViewTitle] = useState("");
  const [viewContent, setViewContent] = useState("");
  const [viewLoading, setViewLoading] = useState(false);
  const filteredDocuments = searchQuery.trim()
    ? documents.filter((d) => d.filename.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : documents;

  const handleViewDoc = async (doc: { id: number; filename: string }) => {
    setViewDocId(doc.id);
    setViewLoading(true);
    setShowViewModal(true);
    setViewTitle(doc.filename);
    setViewContent("");
    try {
      const { data } = await kbApi.getDocument(kbId, doc.id);
      setViewContent(data.content ?? "");
    } catch {
      setViewContent("(加载失败)");
    } finally {
      setViewLoading(false);
    }
  };

  const openEditNote = () => {
    setNoteDocId(viewDocId);
    setNoteTitle(viewTitle.replace(/\.md$/i, ""));
    setNoteContent(viewContent);
    setShowViewModal(false);
    setShowNoteModal(true);
  };

  const handleEditDoc = async (doc: { id: number; filename: string }) => {
    try {
      const { data } = await kbApi.getDocument(kbId, doc.id);
      setNoteDocId(doc.id);
      setNoteTitle(doc.filename.replace(/\.md$/i, ""));
      setNoteContent(data.content ?? "");
      setShowNoteModal(true);
    } catch {
      alert("加载失败");
    }
  };

  const handleDownloadDoc = async (doc: { id: number; filename: string }) => {
    try {
      const { data } = await kbApi.getDocument(kbId, doc.id);
      const blob = new Blob([data.content ?? ""], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.filename.endsWith(".md") ? doc.filename : `${doc.filename}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("下载失败");
    }
  };

  const handleDeleteDoc = async (doc: { id: number; filename: string }) => {
    if (!confirm(`确定删除「${doc.filename}」？`)) return;
    try {
      await kbApi.deleteDocument(kbId, doc.id);
      load();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "删除失败");
    }
  };

  const load = async () => {
    if (!kbId) return;
    setLoading(true);
    try {
      const [kbRes, docsRes, membersRes] = await Promise.all([
        kbApi.get(kbId),
        kbApi.listDocuments(kbId),
        kbApi.listMembers(kbId),
      ]);
      setKb(kbRes.data);
      setDocuments(docsRes.data);
      setMembers(membersRes.data);
    } finally {
      setLoading(false);
    }
  };

  const canManageMembers = kb && (
    currentUser?.is_admin ||
    kb.owner_id === currentUser?.id ||
    members.some(m => m.user_id === currentUser?.id && (m.role === "admin" || m.role === "owner"))
  );

  // 输入时自动搜索（防抖 300ms）
  useEffect(() => {
    if (!showInvite || !addUserQuery.trim()) {
      setSearchUsers([]);
      return;
    }
    const q = addUserQuery.trim();
    const t = setTimeout(async () => {
      try {
        const { data } = await usersApi.search(q);
        setSearchUsers(data);
      } catch {
        setSearchUsers([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [addUserQuery, showInvite]);

  const handleAddMember = async (userId: number) => {
    setAddingMember(true);
    try {
      await kbApi.addMember(kbId, { user_id: userId, role: addRole });
      setAddUserQuery("");
      setSearchUsers([]);
      load();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "添加失败");
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (userId: number) => {
    if (!confirm("确定移出此成员？")) return;
    try {
      await kbApi.removeMember(kbId, userId);
      load();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "移除失败");
    }
  };

  const handleUpdateRole = async (userId: number, role: "read" | "write" | "admin") => {
    try {
      await kbApi.updateMember(kbId, userId, role);
      load();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "更新失败");
    }
  };

  const adminMembers = members.filter(m => m.role === "owner" || m.role === "admin");
  const developerMembers = members.filter(m => m.role === "write");
  const readOnlyMembers = members.filter(m => m.role === "read");

  useEffect(() => {
    load();
  }, [kbId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    setUploading(true);
    try {
      await kbApi.uploadDocument(kbId, file);
      load();
    } catch (err: unknown) {
      setUploadError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "上传失败");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  if (loading || !kb) {
    return (
      <div className="p-8">
        {loading ? "加载中..." : "知识库不存在"}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-3 py-2 -ml-1 mb-6 text-sm font-medium text-slate-600 hover:text-primary-600 hover:bg-slate-100 rounded-lg transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        返回
      </Link>

      {/* 知识库卡片 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <span className="w-8 h-8 min-w-8 min-h-8 rounded-full bg-slate-300 flex items-center justify-center text-sm font-medium text-slate-600 shrink-0">
            {(kb.owner_username || kb.name).charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-slate-800">
              {kb.owner_username ? `${kb.owner_username}/${kb.name}` : kb.name}
            </h1>
              {canManageMembers ? (
                <select
                  value={kb.visibility}
                  onChange={async (e) => {
                    const v = e.target.value as "public" | "private";
                    try {
                      await kbApi.update(kbId, { visibility: v });
                      load();
                    } catch {
                      alert("更新失败");
                    }
                  }}
                  className="px-2 py-0.5 border border-slate-200 rounded text-slate-600 bg-white text-sm"
                >
                  <option value="private">私有</option>
                  <option value="public">公开</option>
                </select>
              ) : (
                <span className="inline-flex px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                  {kb.visibility === "public" ? "公开" : "私有"}
                </span>
              )}
            </div>
            {kb.description && (
              <div className="mt-1 text-sm text-slate-600">{kb.description}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManageMembers && (
            <button
              onClick={() => {
                setEditName(kb.name);
                setEditDescription(kb.description || "");
                setShowEditModal(true);
              }}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
              title="编辑"
            >
              <IconPencil />
            </button>
          )}
          {(kb.owner_id === currentUser?.id || currentUser?.is_admin) && (
            <button
              onClick={async () => {
                if (!confirm("确定删除此知识库？")) return;
                try {
                  await kbApi.delete(kbId);
                  navigate("/");
                } catch {
                  alert("删除失败");
                }
              }}
              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="删除"
            >
              <IconTrash />
            </button>
          )}
        </div>
      </div>

      {/* Tab 栏 - Gitee 风格 */}
      <div className="mb-4 border-b border-slate-200">
        <nav className="flex items-center gap-6 -mb-px">
          <button
            onClick={() => setActiveTab("files")}
            className={`px-1 py-3 text-sm font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeTab === "files"
                ? "text-primary-600 border-primary-600"
                : "text-slate-600 border-transparent hover:text-slate-800"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <IconFolder />
              文档
              {documents.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500 font-normal">
                  {documents.length}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("members")}
            className={`px-1 py-3 text-sm font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeTab === "members"
                ? "text-primary-600 border-primary-600"
                : "text-slate-600 border-transparent hover:text-slate-800"
            }`}
          >
            <IconUsers />
            成员 {members.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500 font-normal">
                {members.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {uploadError && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{uploadError}</div>
      )}

      {activeTab === "files" && (
        <>
      {/* 搜索框 + 操作按钮 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索文档标题..."
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-primary-700 transition-colors shadow-sm">
            <input
              type="file"
              accept=".md"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
            {uploading ? "上传中..." : "上传文档"}
          </label>
          <button
            onClick={() => {
              setNoteDocId(null);
              setNoteTitle("");
              setNoteContent("");
              setUploadError("");
              setShowNoteModal(true);
            }}
            className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            新建文档
          </button>
          </div>
      </div>

      {/* 文档表格 */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 w-10">
                  <input type="checkbox" className="rounded" />
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">标题</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">大小</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">最后更新</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <div className="text-slate-400 text-sm">
                      {documents.length === 0 ? (
                        <>
                          <span className="block text-4xl mb-2">📄</span>
                          <span>暂无文档，上传文档或新建文档开始使用</span>
                        </>
                      ) : (
                        "未找到匹配的文档"
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <input type="checkbox" className="rounded" />
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => handleViewDoc(doc)}
                        className="font-medium text-slate-800 hover:text-primary-600 hover:underline text-left cursor-pointer"
                      >
                        {doc.filename.replace(/\.md$/i, "")}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{formatSize(doc.file_size)}</td>
                    <td className="py-3 px-4 text-slate-500 text-sm">{formatUpdatedAt(doc.updated_at ?? doc.created_at)}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-slate-400">
                        <button
                          type="button"
                          onClick={() => handleEditDoc(doc)}
                          className="p-2 hover:bg-slate-100 hover:text-slate-700 rounded-lg cursor-pointer transition-colors"
                          title="编辑"
                        >
                          <IconPencil />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadDoc(doc)}
                          className="p-2 hover:bg-slate-100 hover:text-slate-700 rounded-lg cursor-pointer transition-colors"
                          title="下载"
                        >
                          <IconDownload />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDoc(doc)}
                          className="p-2 hover:bg-red-50 rounded-lg cursor-pointer transition-colors text-red-500 hover:text-red-600"
                          title="删除"
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {filteredDocuments.length > 0 && (
            <div className="py-2.5 px-4 border-t border-slate-100 text-sm text-slate-500 flex justify-end items-center gap-1">
              <span className="text-slate-400">第 1 / 1 页</span>
            </div>
          )}
        </div>
        </>
      )}

      {activeTab === "members" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">成员管理</h3>
            {canManageMembers && (
              <button
                onClick={() => setShowInvite(true)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
              >
                邀请用户
              </button>
            )}
          </div>

          {showInvite && canManageMembers && (
            <div className="p-5 bg-amber-50 border-b border-amber-200">
              <div className="flex flex-wrap items-end gap-3 mb-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">权限</label>
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value as "read" | "write" | "admin")}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="read">只读</option>
                    <option value="write">开发者</option>
                    <option value="admin">管理员</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">搜索用户</label>
                  <input
                    type="text"
                    value={addUserQuery}
                    onChange={(e) => setAddUserQuery(e.target.value)}
                    placeholder="输入用户名或邮箱搜索"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-48 focus:ring-2 focus:ring-primary-500 bg-white"
                  />
                </div>
                <button
                  onClick={() => setShowInvite(false)}
                  className="text-slate-500 hover:text-slate-700 text-sm"
                >
                  收起
                </button>
              </div>
              {searchUsers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {searchUsers.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm"
                    >
                      <span className="font-medium">{u.username}</span>
                      <span className="text-slate-500">{u.email}</span>
                      <button
                        onClick={() => handleAddMember(u.id)}
                        disabled={addingMember || members.some(m => m.user_id === u.id)}
                        className="px-2 py-1 bg-primary-600 text-white rounded text-xs hover:bg-primary-700 disabled:opacity-50"
                      >
                        {members.some(m => m.user_id === u.id) ? "已是成员" : "添加"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="divide-y divide-slate-200">
            {adminMembers.length > 0 && (
              <div className="p-5">
                <h4 className="text-sm font-medium text-slate-600 mb-3">管理员 ({adminMembers.length})</h4>
                <div className="space-y-3">
                  {adminMembers.map((m) => (
                    <div key={m.user_id} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 min-w-8 min-h-8 rounded-full bg-slate-300 flex items-center justify-center text-sm font-medium text-slate-600 shrink-0">
                          {m.username.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-800">{m.username}</span>
                            <span className="inline-flex px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                              {m.role === "owner" ? "知识库拥有者" : "管理员"}
                            </span>
                            {m.user_id === currentUser?.id && (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                                我自己
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-500">{m.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {canManageMembers && m.role !== "owner" && (
                          <>
                            <select
                              value={m.role}
                              onChange={(e) => handleUpdateRole(m.user_id, e.target.value as "admin" | "write" | "read")}
                              className="px-2 py-1 border border-slate-300 rounded text-sm bg-white"
                            >
                              <option value="admin">管理员</option>
                              <option value="write">开发者</option>
                              <option value="read">只读</option>
                            </select>
                            <button
                              onClick={() => handleRemoveMember(m.user_id)}
                              className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
                            >
                              移出知识库
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {developerMembers.length > 0 && (
              <div className="p-5">
                <h4 className="text-sm font-medium text-slate-600 mb-3">开发者 ({developerMembers.length})</h4>
                <div className="space-y-3">
                  {developerMembers.map((m) => (
                    <div key={m.user_id} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 min-w-8 min-h-8 rounded-full bg-slate-300 flex items-center justify-center text-sm font-medium text-slate-600 shrink-0">
                          {m.username.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-800">{m.username}</span>
                            {m.user_id === currentUser?.id && (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                                我自己
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-500">{m.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {canManageMembers && (
                          <>
                            <select
                              value={m.role}
                              onChange={(e) => handleUpdateRole(m.user_id, e.target.value as "admin" | "write" | "read")}
                              className="px-2 py-1 border border-slate-300 rounded text-sm bg-white"
                            >
                              <option value="admin">管理员</option>
                              <option value="write">开发者</option>
                              <option value="read">只读</option>
                            </select>
                            <button
                              onClick={() => handleRemoveMember(m.user_id)}
                              className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
                            >
                              移出知识库
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {readOnlyMembers.length > 0 && (
              <div className="p-5">
                <h4 className="text-sm font-medium text-slate-600 mb-3">只读 ({readOnlyMembers.length})</h4>
                <div className="space-y-3">
                  {readOnlyMembers.map((m) => (
                    <div key={m.user_id} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 min-w-8 min-h-8 rounded-full bg-slate-300 flex items-center justify-center text-sm font-medium text-slate-600 shrink-0">
                          {m.username.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-800">{m.username}</span>
                            {m.user_id === currentUser?.id && (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                                我自己
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-500">{m.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {canManageMembers && (
                          <>
                            <select
                              value={m.role}
                              onChange={(e) => handleUpdateRole(m.user_id, e.target.value as "admin" | "write" | "read")}
                              className="px-2 py-1 border border-slate-300 rounded text-sm bg-white"
                            >
                              <option value="admin">管理员</option>
                              <option value="write">开发者</option>
                              <option value="read">只读</option>
                            </select>
                            <button
                              onClick={() => handleRemoveMember(m.user_id)}
                              className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
                            >
                              移出知识库
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {members.length === 0 && (
              <div className="p-12 text-center text-slate-500">
                暂无成员
              </div>
            )}
          </div>
        </div>
      )}

      {/* 新建/编辑文档弹窗 - 与新建文档相同 UI（MD 编辑器） */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            <h2 className="text-lg font-semibold mb-1">{noteDocId != null ? "编辑文档" : "新建文档"}</h2>
            <p className="text-sm text-slate-500 mb-4">将原文传给大模型，不参与向量检索，适合规则、记忆、审查事项等内容。</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!noteTitle.trim()) return;
                setCreatingNote(true);
                setUploadError("");
                try {
                  if (noteDocId != null) {
                    const title = noteTitle.trim();
                    const filename = /\.md$/i.test(title) ? title : `${title}.md`;
                    await kbApi.updateDocument(kbId, noteDocId, { title: filename, content: noteContent || "" });
                  } else {
                    await kbApi.createDocument(kbId, { title: noteTitle.trim(), content: noteContent || "" });
                  }
                  setShowNoteModal(false);
                  setNoteDocId(null);
                  load();
                } catch (err: unknown) {
                  setUploadError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || (noteDocId != null ? "保存失败" : "创建失败"));
                } finally {
                  setCreatingNote(false);
                }
              }}
              className="flex flex-col flex-1 min-h-0"
            >
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">标题</label>
                <input
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="输入文档标题"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div className="flex-1 min-h-[300px] mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">内容（支持 Markdown）</label>
                <div data-color-mode="light" className="flex-1">
                  <Suspense fallback={<div className="h-[300px] border border-slate-200 rounded-lg p-4 text-sm text-slate-500">编辑器加载中...</div>}>
                    <MarkdownEditor
                      value={noteContent}
                      onChange={(v) => setNoteContent(v ?? "")}
                      height={300}
                      preview="live"
                      components={{
                        preview: (source) => <MarkdownPreview source={stripFrontMatterForPreview(source ?? "")} />,
                      }}
                    />
                  </Suspense>
                </div>
              </div>
              {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setShowNoteModal(false); setNoteDocId(null); }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creatingNote}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {creatingNote ? (noteDocId != null ? "保存中..." : "创建中...") : (noteDocId != null ? "保存" : "创建")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 查看文档弹窗 - 渲染 Markdown */}
      {showViewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowViewModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800 truncate">{viewTitle.replace(/\.md$/i, "")}</h2>
              <button type="button" onClick={() => setShowViewModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 shrink-0">✕</button>
            </div>
            <div data-color-mode="light" className="flex-1 overflow-auto border border-slate-200 rounded-lg p-4 bg-white min-h-[200px]">
              {viewLoading ? (
                <p className="text-slate-500 text-sm">加载中...</p>
              ) : viewContent ? (
                <Suspense fallback={<p className="text-slate-500 text-sm">渲染中...</p>}>
                  <MarkdownPreview source={stripFrontMatterForPreview(viewContent)} />
                </Suspense>
              ) : (
                <p className="text-slate-500 text-sm">(无内容)</p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={openEditNote} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">编辑</button>
              <button type="button" onClick={() => setShowViewModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑知识库弹窗 */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">编辑知识库</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                try {
                  await kbApi.update(kbId, { name: editName, description: editDescription });
                  setShowEditModal(false);
                  load();
                } catch {
                  alert("更新失败");
                } finally {
                  setSaving(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">名称</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  rows={3}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
