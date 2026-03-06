import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { kbApi, KnowledgeBase } from "../api/knowledgeBase";
import { activityApi, Activity } from "../api/activity";
import ChatComposer from "../components/ChatComposer";
import { useAuth } from "../context/AuthContext";

type KbListTab = "public" | "joined";

export default function Home() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.is_admin);
  const [selectedKbIds, setSelectedKbIds] = useState<number[]>([]);
  const [listJoined, setListJoined] = useState<KnowledgeBase[]>([]);
  const [listPublic, setListPublic] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [error, setError] = useState("");
  const [kbListTab, setKbListTab] = useState<KbListTab>("joined");
  const [searchQuery, setSearchQuery] = useState("");
  const [composerQuestion, setComposerQuestion] = useState("");
  const [feedScope, setFeedScope] = useState<"all" | "mine">("all");
  const [activityList, setActivityList] = useState<Activity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [feedFilterOpen, setFeedFilterOpen] = useState(false);
  const feedFilterRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const list = kbListTab === "joined" ? listJoined : listPublic;

  const loadBoth = async () => {
    setLoading(true);
    try {
      const [joinedRes, publicRes] = await Promise.all([
        kbApi.list({ scope: "joined" }),
        kbApi.list({ scope: "public" }),
      ]);
      setListJoined(joinedRes.data);
      setListPublic(publicRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoth();
  }, []);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (feedFilterRef.current && !feedFilterRef.current.contains(e.target as Node)) {
        setFeedFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const loadActivities = async () => {
    setActivityLoading(true);
    try {
      const { data } = await activityApi.list(feedScope);
      setActivityList(data);
    } finally {
      setActivityLoading(false);
    }
  };

  useEffect(() => {
    loadActivities();
  }, [feedScope]);

  useEffect(() => {
    if (showModal && !isAdmin) {
      setVisibility("private");
    }
  }, [showModal, isAdmin]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName || !trimmedDescription) {
      setError("名称和描述不能为空");
      return;
    }
    try {
      await kbApi.create({ name: trimmedName, description: trimmedDescription, visibility });
      setShowModal(false);
      setName("");
      setDescription("");
      setVisibility("private");
      loadBoth();
      loadActivities();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "创建失败");
    }
  };

  const filteredList = searchQuery.trim()
    ? list.filter(
        (kb) =>
          kb.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (kb.description || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : list;

  const handleAsk = (question: string, kbIds: number[]) => {
    const payload = { question, kbIds };
    setComposerQuestion("");
    navigate("/chat", { state: payload });
  };

  const formatRelativeTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (diffDays === 0) return "今天";
    if (diffDays === 1) return "1 天前";
    if (diffDays < 7) return `${diffDays} 天前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} 个月前`;
    return `${Math.floor(diffDays / 365)} 年前`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const groupedByDate = activityList.reduce<Record<string, Activity[]>>((acc, a) => {
    const key = formatDate(a.created_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});
  const dateKeys = Object.keys(groupedByDate).sort((a, b) => (a > b ? -1 : 1));

  const getActivityActionText = (a: Activity) => {
    if (a.action === "create_kb") return "创建了知识库";
    if (a.action === "upload_doc") return "上传了文档";
    if (a.action === "add_member") return "添加了成员";
    if (a.action === "create_note") return "新建了文档";
    if (a.action === "update_note") return "修改了文档";
    if (a.action === "delete_note") return "删除了文档";
    return a.action_label;
  };

  const getActivityBoxContent = (a: Activity) => {
    const kbLabel = a.knowledge_base_owner && a.knowledge_base_name
      ? `${a.knowledge_base_owner}/${a.knowledge_base_name}`
      : a.knowledge_base_name
        ? `${a.knowledge_base_name}`
        : "";
    if (a.action === "create_kb") {
      const name = (a.extra?.name as string) || a.knowledge_base_name || "";
      const owner = a.knowledge_base_owner || a.username;
      return { primary: owner && name ? `${owner}/${name}` : name, secondary: null };
    }
    if (a.action === "upload_doc") return { primary: kbLabel, secondary: (a.extra?.filename as string) || "" };
    if (a.action === "add_member") return { primary: kbLabel, secondary: `${(a.extra?.member_username as string) || ""} (${(a.extra?.role as string) || "read"})` };
    if (a.action === "create_note") return { primary: kbLabel, secondary: (a.extra?.filename as string) || "" };
    if (a.action === "update_note") return { primary: kbLabel, secondary: (a.extra?.filename as string) || "" };
    if (a.action === "delete_note") return { primary: kbLabel, secondary: (a.extra?.filename as string) || "" };
    return { primary: "", secondary: null };
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* 左侧：知识库列表 */}
      <aside className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 pt-6 pb-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">知识库</h2>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                <path d="M12 6v12" />
                <path d="M10 18l2-3 2 3" />
              </svg>
              新建
            </button>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索知识库..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <div className="flex mt-2 rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setKbListTab("joined")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
                kbListTab === "joined"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              我参与的
            </button>
            <button
              type="button"
              onClick={() => setKbListTab("public")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
                kbListTab === "public"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              公开的
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-4 text-slate-500 text-sm">加载中...</div>
          ) : filteredList.length === 0 ? (
            <div className="p-4 text-slate-500 text-sm">
              {list.length === 0
                ? kbListTab === "public"
                  ? "暂无公开知识库"
                  : "暂无参与的知识库"
                : "无匹配结果"}
            </div>
          ) : (
            <ul className="pt-1 pb-2">
              {filteredList.map((kb) => (
                <li key={kb.id}>
                  <Link
                    to={`/kb/${kb.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span className="w-8 h-8 min-w-8 min-h-8 rounded-full bg-slate-300 flex items-center justify-center shrink-0 text-sm font-medium text-slate-600">
                      {(kb.owner_username || kb.name).charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {kb.owner_username ? `${kb.owner_username}/${kb.name}` : kb.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {kb.visibility === "public" ? "公开" : "私有"} · {kb.document_count} 文件
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* 右侧：AI 会话 + Feed */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-auto p-6">

          {/* AI 会话区 */}
          <div className="mb-8">
            <ChatComposer
              value={composerQuestion}
              onChange={setComposerQuestion}
              onSubmit={handleAsk}
              selectedKbIds={selectedKbIds}
              onSelectedKbIdsChange={setSelectedKbIds}
              knowledgeBases={{ joined: listJoined, public: listPublic }}
            />
          </div>

          {/* 动态时间线 */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">动态</h2>
              <div className="relative" ref={feedFilterRef}>
                <button
                  type="button"
                  onClick={() => setFeedFilterOpen((o) => !o)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
                >
                  {feedScope === "all" ? "所有动态" : "我的动态"}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {feedFilterOpen && (
                  <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50">
                    <button
                      type="button"
                      onClick={() => { setFeedScope("all"); setFeedFilterOpen(false); }}
                      className={`w-full px-3 py-2 text-left text-sm ${feedScope === "all" ? "bg-primary-50 text-primary-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}
                    >
                      所有动态
                    </button>
                    <button
                      type="button"
                      onClick={() => { setFeedScope("mine"); setFeedFilterOpen(false); }}
                      className={`w-full px-3 py-2 text-left text-sm ${feedScope === "mine" ? "bg-primary-50 text-primary-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}
                    >
                      我的动态
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div>
              {activityLoading ? (
                <div className="py-12 text-center text-slate-500 text-sm">加载中...</div>
              ) : dateKeys.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">暂无动态</div>
              ) : (
                <div className="relative py-4">
                  {/* 竖线：从第一个小圆点下方开始，第一个圆点上方不显示竖线 */}
                  <div className="absolute left-[15px] top-9 bottom-4 w-px -translate-x-1/2 bg-slate-200" />
                  <div className="space-y-6 pl-0">
                    {dateKeys.map((dateKey) => (
                      <div key={dateKey}>
                        {/* 日期行：圆点居中于竖线 */}
                        <div className="relative flex items-center gap-3 mb-3">
                          <span className="absolute left-[15px] top-1/2 w-2.5 h-2.5 rounded-full bg-primary-500 shrink-0 -translate-x-1/2 -translate-y-1/2 z-10" />
                          <span className="text-sm font-semibold text-slate-800 pl-6">{dateKey}</span>
                        </div>
                        <div className="space-y-4">
                          {groupedByDate[dateKey].map((a) => {
                            const box = getActivityBoxContent(a);
                            return (
                              <div key={a.id} className="relative flex min-h-8">
                                {/* 头像：居中于竖线，与日期圆点一样在时间线上 */}
                                <div
                                  className="absolute left-[15px] top-0 w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center text-slate-600 text-sm font-medium border-2 border-white -translate-x-1/2 z-10"
                                >
                                  {a.username.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1 pl-11">
                                  <p className="text-sm text-slate-700">
                                    <span className="font-medium text-slate-900">{a.username}</span>
                                    <span className="text-slate-500"> {getActivityActionText(a)} </span>
                                    <span className="text-slate-500">{formatRelativeTime(a.created_at)}</span>
                                  </p>
                                  {(box.primary || box.secondary) && (
                                    <div className="mt-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                                      {a.knowledge_base_id ? (
                                        <p className="text-sm text-slate-700">
                                          <Link
                                            to={`/kb/${a.knowledge_base_id}`}
                                            className="text-primary-600 hover:underline font-medium"
                                          >
                                            {box.primary}
                                          </Link>
                                          {box.secondary && (
                                            <span className="text-slate-600"> · {box.secondary}</span>
                                          )}
                                        </p>
                                      ) : (
                                        <p className="text-sm text-slate-700">
                                          {box.primary}
                                          {box.secondary && ` · ${box.secondary}`}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* 新建知识库弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">新建知识库</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">名称</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  rows={3}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">可见性</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as "public" | "private")}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="private">私有</option>
                  {isAdmin ? (
                    <option value="public">公开</option>
                  ) : (
                    <option value="public" disabled>
                      公开（仅管理员可设置）
                    </option>
                  )}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  私有：仅您和受邀成员可访问；
                  公开：所有人可查看（需系统管理员设置）
                </p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  取消
                </button>
                <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
