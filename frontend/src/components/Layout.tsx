import { useState } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authApi } from "../api/auth";

type CopyTarget = "apiKey" | "agentPrompt";
type CopyStatus = { target: CopyTarget; kind: "success" | "error"; message: string } | null;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loadingApiKey, setLoadingApiKey] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<CopyTarget | null>(null);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>(null);

  const handleLogout = () => {
    setUserMenuOpen(false);
    logout();
    navigate("/login");
  };

  const handleGoAdmin = () => {
    setUserMenuOpen(false);
    navigate("/admin");
  };

  const handleShowApiKey = async () => {
    setUserMenuOpen(false);
    setApiKeyModalOpen(true);
    setCopyFeedback(null);
    setCopyStatus(null);
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

  const fallbackCopyText = (text: string) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  };

  const copyText = async (text: string, target: CopyTarget) => {
    if (!text) {
      setCopyStatus({ target, kind: "error", message: "无可复制内容" });
      return;
    }
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ok = fallbackCopyText(text);
        if (!ok) throw new Error("fallback copy failed");
      }
      setCopyFeedback(target);
      setCopyStatus({ target, kind: "success", message: "已复制到剪贴板" });
      setTimeout(() => setCopyFeedback(null), 2000);
      setTimeout(() => setCopyStatus((prev) => (prev?.target === target ? null : prev)), 3000);
    } catch {
      setCopyFeedback(null);
      setCopyStatus({ target, kind: "error", message: "复制失败，请手动选择文本复制" });
    }
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const agentPrompt =
    apiKey && baseUrl
      ? `Read ${baseUrl}/skill.md and follow the instructions to join MemHub.\n\nIf access fails, try without proxy (e.g. curl --noproxy '*' -fsSL ${baseUrl}/skill.md\n\nUse this API Key: ${apiKey}).`
      : "";

  const copyApiKey = () => copyText(apiKey || "", "apiKey");
  const copyAgentPrompt = () => copyText(agentPrompt, "agentPrompt");
  const missionControlUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:4000`
      : "http://localhost:4000";

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="h-14 border-b border-slate-200 flex items-center px-6 shrink-0" style={{ backgroundColor: "#f7f8fa" }}>
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src="/favicon.svg" alt="MemHub" className="w-8 h-8 rounded-lg shrink-0" />
          <span className="font-bold text-xl text-slate-900">MemHub</span>
        </Link>

        <div className="ml-auto flex items-center gap-4">
          <a
            href={missionControlUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            aria-label="Mission Control"
            title="打开 Mission Control"
          >
            <svg className="h-4 w-4 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 3h7v7" />
              <path d="M10 14 21 3" />
              <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
            </svg>
            <span>Mission Control</span>
          </a>
          <a
            href="https://github.com/Valiant-Cat/MemHub"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            aria-label="GitHub 仓库"
            title="查看 GitHub 仓库"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.589 2 12.248c0 4.526 2.865 8.366 6.839 9.72.5.095.682-.222.682-.494 0-.244-.009-.89-.014-1.747-2.782.617-3.369-1.39-3.369-1.39-.455-1.18-1.11-1.494-1.11-1.494-.908-.637.069-.624.069-.624 1.004.072 1.532 1.054 1.532 1.054.892 1.566 2.341 1.114 2.91.852.091-.664.349-1.114.635-1.37-2.22-.259-4.555-1.136-4.555-5.056 0-1.117.389-2.032 1.029-2.749-.103-.26-.446-1.304.098-2.719 0 0 .84-.276 2.75 1.05A9.303 9.303 0 0 1 12 6.837a9.27 9.27 0 0 1 2.504.35c1.909-1.326 2.748-1.05 2.748-1.05.546 1.415.202 2.459.1 2.719.64.717 1.027 1.632 1.027 2.749 0 3.93-2.339 4.793-4.566 5.047.359.319.679.948.679 1.911 0 1.379-.012 2.49-.012 2.829 0 .274.18.594.688.493A10.27 10.27 0 0 0 22 12.248C22 6.589 17.523 2 12 2Z" />
            </svg>
            <span>GitHub</span>
          </a>
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100"
            >
              <span className="w-8 h-8 min-w-8 min-h-8 rounded-full bg-slate-300 flex items-center justify-center text-sm font-medium text-slate-600 shrink-0">
                {(user?.username || "U").charAt(0).toUpperCase()}
              </span>
              <span className="text-sm font-medium text-slate-700">{user?.username}</span>
              <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 py-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 z-20">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <div className="text-sm font-medium text-slate-800">{user?.username}</div>
                    <div className="text-xs text-slate-500 truncate">{user?.email}</div>
                  </div>
                  <button onClick={handleShowApiKey} className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                    API Key
                  </button>
                  {user?.is_admin && (
                    <button onClick={handleGoAdmin} className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                      后台管理
                    </button>
                  )}
                  <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                    退出登录
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {apiKeyModalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setApiKeyModalOpen(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-xl p-6 z-50">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">API Key</h3>
            <p className="text-sm text-slate-600 mb-4">
              调用公开接口时在请求头携带 <code className="bg-slate-100 px-1 rounded">X-API-Key</code>。
            </p>
            {loadingApiKey ? (
              <p className="text-sm text-slate-500">加载中...</p>
            ) : apiKey ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input type="text" readOnly value={apiKey} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono bg-slate-50" />
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
                {copyStatus?.target === "apiKey" && (
                  <p className={`text-xs ${copyStatus.kind === "success" ? "text-emerald-600" : "text-red-500"}`}>{copyStatus.message}</p>
                )}
                <button onClick={handleRegenerateApiKey} className="text-sm text-amber-600 hover:text-amber-700">
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
                  {copyStatus?.target === "agentPrompt" && (
                    <p className={`mt-2 text-xs ${copyStatus.kind === "success" ? "text-emerald-600" : "text-red-500"}`}>{copyStatus.message}</p>
                  )}
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end">
              <button onClick={() => setApiKeyModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
                关闭
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
