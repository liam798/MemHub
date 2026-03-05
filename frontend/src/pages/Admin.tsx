import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminApi,
  AdminKnowledgeBase,
  AdminUser,
  AdminUserKnowledgeBase,
} from "../api/admin";

type TabKey = "users" | "kbs";

function formatTime(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function AdminPage() {
  const [tab, setTab] = useState<TabKey>("users");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [kbs, setKbs] = useState<AdminKnowledgeBase[]>([]);
  const [activeUser, setActiveUser] = useState<AdminUser | null>(null);
  const [activeUserKbs, setActiveUserKbs] = useState<AdminUserKnowledgeBase[]>([]);
  const [activeUserKbsLoading, setActiveUserKbsLoading] = useState(false);
  const [activeUserKbsError, setActiveUserKbsError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [usersRes, kbsRes] = await Promise.all([
        adminApi.listUsers(),
        adminApi.listKnowledgeBases(),
      ]);
      setUsers(usersRes.data);
      setKbs(kbsRes.data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openUserKbs = async (user: AdminUser) => {
    setActiveUser(user);
    setActiveUserKbs([]);
    setActiveUserKbsError("");
    setActiveUserKbsLoading(true);
    try {
      const { data } = await adminApi.listUserKnowledgeBases(user.id);
      setActiveUserKbs(data);
    } catch (err: unknown) {
      setActiveUserKbsError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "加载失败");
    } finally {
      setActiveUserKbsLoading(false);
    }
  };

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

      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">后台管理</h1>
          <p className="text-sm text-slate-500 mt-1">查看用户列表、知识库列表等系统信息。</p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          刷新
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-sm text-slate-500">用户总数</div>
          <div className="text-2xl font-semibold text-slate-800 mt-1">{users.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-sm text-slate-500">知识库总数</div>
          <div className="text-2xl font-semibold text-slate-800 mt-1">{kbs.length}</div>
        </div>
      </div>

      <div className="mb-4 border-b border-slate-200">
        <nav className="flex items-center gap-6 -mb-px">
          <button
            onClick={() => setTab("users")}
            className={`px-1 py-3 text-sm font-medium border-b-2 transition ${
              tab === "users"
                ? "text-primary-600 border-primary-600"
                : "text-slate-600 border-transparent hover:text-slate-800"
            }`}
          >
            用户列表
          </button>
          <button
            onClick={() => setTab("kbs")}
            className={`px-1 py-3 text-sm font-medium border-b-2 transition ${
              tab === "kbs"
                ? "text-primary-600 border-primary-600"
                : "text-slate-600 border-transparent hover:text-slate-800"
            }`}
          >
            知识库列表
          </button>
        </nav>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-slate-500">加载中...</div>
        ) : tab === "users" ? (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">ID</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">用户名</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">邮箱</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">角色</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">拥有知识库</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">注册时间</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="py-3 px-4 text-sm text-slate-700">{u.id}</td>
                  <td className="py-3 px-4 text-sm">
                    <button
                      type="button"
                      onClick={() => openUserKbs(u)}
                      className="text-primary-600 hover:underline"
                    >
                      {u.username}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">{u.email}</td>
                  <td className="py-3 px-4 text-sm">
                    {u.is_admin ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-xs">管理员</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-xs">普通用户</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">{u.owned_kb_count}</td>
                  <td className="py-3 px-4 text-sm text-slate-500">{formatTime(u.created_at)}</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 px-4 text-center text-sm text-slate-500">暂无数据</td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">ID</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">知识库</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">所有者</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">可见性</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">文档数</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">更新时间</th>
              </tr>
            </thead>
            <tbody>
              {kbs.map((kb) => (
                <tr key={kb.id} className="border-b border-slate-100">
                  <td className="py-3 px-4 text-sm text-slate-700">{kb.id}</td>
                  <td className="py-3 px-4 text-sm">
                    <Link to={`/kb/${kb.id}`} className="text-primary-600 hover:underline">
                      {kb.name}
                    </Link>
                    {kb.description && (
                      <div className="text-xs text-slate-500 mt-1 truncate max-w-[360px]">{kb.description}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">{kb.owner_username}</td>
                  <td className="py-3 px-4 text-sm">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-xs">
                      {kb.visibility === "public" ? "公开" : "私有"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">{kb.document_count}</td>
                  <td className="py-3 px-4 text-sm text-slate-500">{formatTime(kb.updated_at)}</td>
                </tr>
              ))}
              {kbs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 px-4 text-center text-sm text-slate-500">暂无数据</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {activeUser && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setActiveUser(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">
                {activeUser.username} 的知识库列表
              </h2>
              <button
                type="button"
                onClick={() => setActiveUser(null)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto border border-slate-200 rounded-lg">
              {activeUserKbsLoading ? (
                <div className="p-6 text-sm text-slate-500">加载中...</div>
              ) : activeUserKbsError ? (
                <div className="p-6 text-sm text-red-600">{activeUserKbsError}</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">知识库</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">该用户角色</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">所有者</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">文档数</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">更新时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeUserKbs.map((kb) => (
                      <tr key={kb.id} className="border-b border-slate-100">
                        <td className="py-3 px-4 text-sm">
                          <Link to={`/kb/${kb.id}`} className="text-primary-600 hover:underline" onClick={() => setActiveUser(null)}>
                            {kb.name}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-700">{kb.user_role}</td>
                        <td className="py-3 px-4 text-sm text-slate-700">{kb.owner_username}</td>
                        <td className="py-3 px-4 text-sm text-slate-700">{kb.document_count}</td>
                        <td className="py-3 px-4 text-sm text-slate-500">{formatTime(kb.updated_at)}</td>
                      </tr>
                    ))}
                    {activeUserKbs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-10 px-4 text-center text-sm text-slate-500">
                          暂无关联知识库
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
