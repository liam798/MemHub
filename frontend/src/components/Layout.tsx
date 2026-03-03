import { useState } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authApi } from "../api/auth";

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loadingApiKey, setLoadingApiKey] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<"apiKey" | "agentPrompt" | null>(null);

  const handleLogout = () => {
    setUserMenuOpen(false);
    logout();
    navigate("/login");
  };

  const handleShowApiKey = async () => {
    setUserMenuOpen(false);
    setApiKeyModalOpen(true);
    setCopyFeedback(null);
    setLoadingApiKey(true);
    setApiKey(null);
    try {
      const { data } = await authApi.getApiKey();
      setApiKey(data.api_key);
    } catch {
      setApiKey("获取失败");
    } finally {
      setLoadingApiKey(false);
    }
  };

  const handleRegenerateApiKey = async () => {
    if (!confirm("重新生成后旧 API Key 将失效，确定继续？")) return;
    setLoadingApiKey(true);
    try {
      const { data } = await authApi.regenerateApiKey();
      setApiKey(data.api_key);
    } catch {
      setApiKey("生成失败");
    } finally {
      setLoadingApiKey(false);
    }
  };

  const copyApiKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      setCopyFeedback("apiKey");
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "";
  const agentPrompt =
    apiKey && baseUrl
      ? `Read ${baseUrl}/skill.md and follow the instructions to join MemHub. Use this API Key: ${apiKey}\n\nIf access fails, try without proxy (e.g. curl --noproxy '*' -fsSL ${baseUrl}/skill.md).`
      : "";

  const copyAgentPrompt = () => {
    if (agentPrompt) {
      navigator.clipboard.writeText(agentPrompt);
      setCopyFeedback("agentPrompt");
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* 顶部导航栏 */}
      <header className="h-14 border-b border-slate-200 flex items-center px-6 shrink-0" style={{ backgroundColor: "#f7f8fa" }}>
        {/* 左侧 Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="font-bold text-xl text-primary-600">MemHub</span>
        </Link>

        {/* 右侧：用户 */}
        <div className="ml-auto flex items-center gap-4">
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100"
            >
              <span className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 text-sm font-medium">
                {user?.username?.charAt(0) || "U"}
              </span>
              <span className="text-sm font-medium text-slate-700">{user?.username}</span>
              <span className="text-slate-400">▼</span>
            </button>
            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 py-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 z-20">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <div className="text-sm font-medium text-slate-800">{user?.username}</div>
                    <div className="text-xs text-slate-500 truncate">{user?.email}</div>
                  </div>
                  <button
                    onClick={handleShowApiKey}
                    className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    API Key
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    退出登录
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* API Key 弹窗 */}
      {apiKeyModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setApiKeyModalOpen(false)}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-xl p-6 z-50">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">API Key</h3>
            <p className="text-sm text-slate-600 mb-4">
              调用公开接口时在请求头携带 <code className="bg-slate-100 px-1 rounded">X-API-Key</code>。
            </p>
            {loadingApiKey ? (
              <p className="text-sm text-slate-500">加载中ƒ...</p>
            ) : apiKey ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={apiKey}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono bg-slate-50"
                  />
                  <button
                    onClick={copyApiKey}
                    className={`px-4 py-2 rounded-lg text-sm text-white font-medium transition-all duration-200 ${
                      copyFeedback === "apiKey"
                        ? "bg-emerald-500 hover:bg-emerald-500 ring-2 ring-emerald-200 cursor-default"
                        : "bg-primary-600 hover:bg-primary-700"
                    }`}
                  >
                    {copyFeedback === "apiKey" ? "✓ 已复制" : "复制"}
                  </button>
                </div>
                <button
                  onClick={handleRegenerateApiKey}
                  className="text-sm text-amber-600 hover:text-amber-700"
                >
                  重新生成（旧 Key 将失效）
                </button>
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-sm text-slate-600 mb-2">Agent 接入：复制下面提示词粘贴给 Agent。</p>
                  <textarea
                    readOnly
                    value={agentPrompt}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono bg-slate-50 resize-none"
                  />
                  <button
                    onClick={copyAgentPrompt}
                    className={`mt-2 px-4 py-2 rounded-lg text-sm text-white font-medium transition-all duration-200 ${
                      copyFeedback === "agentPrompt"
                        ? "bg-emerald-500 hover:bg-emerald-500 ring-2 ring-emerald-200 cursor-default"
                        : "bg-primary-600 hover:bg-primary-700"
                    }`}
                  >
                    {copyFeedback === "agentPrompt" ? "✓ 已复制" : "复制 Agent 提示词"}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setApiKeyModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                关闭
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
