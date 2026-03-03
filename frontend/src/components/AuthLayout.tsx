import { Link } from "react-router-dom";

type AuthLayoutProps = {
  title: string;
  linkLabel: string;
  linkTo: string;
  linkText: string;
  showApiKeyTip?: boolean;
  children: React.ReactNode;
};

export default function AuthLayout({
  title,
  linkLabel,
  linkTo,
  linkText,
  showApiKeyTip = false,
  children,
}: AuthLayoutProps) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "linear-gradient(180deg, #eef2f7 0%, #e2e8f0 100%)" }}
    >
      <div className="w-full max-w-4xl h-[520px] flex rounded-2xl shadow-2xl overflow-hidden bg-white border border-slate-200/60">
        {/* 左栏：品牌 / 宣传区 */}
        <div
          className="w-[42%] flex flex-col justify-between p-8 sm:p-10 text-white shrink-0"
          style={{
            background: "linear-gradient(165deg, #1a2d42 0%, #0f1c2e 50%, #0d1520 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <div>
            <div className="flex items-center gap-2 mb-6">
              <img src="/favicon.svg" alt="MemHub" className="w-10 h-10 rounded-lg shrink-0" />
              <span className="text-xl font-semibold tracking-tight">MemHub</span>
            </div>
            <h2 className="text-2xl font-bold leading-tight mb-3">
              面向 AI Agent 的记忆仓库
            </h2>
            <ul className="text-slate-400 text-sm space-y-2 mt-10">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-400 shrink-0" />
                记忆检索与问答
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-400 shrink-0" />
                多知识库、细粒度权限
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-400 shrink-0" />
                按库内规则执行（Review、规范等）
              </li>
            </ul>
          </div>
          <a
            href="/skill.md"
            className="text-slate-400 hover:text-white text-sm transition-colors inline-flex items-center gap-1 mt-6"
          >
            了解 Agent 接入文档
            <span aria-hidden>→</span>
          </a>
        </div>

        {/* 右栏：表单区 */}
        <div className="flex-1 flex flex-col justify-center p-8 sm:p-10 min-w-0">
          <div className="max-w-sm w-full mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
              <span className="text-sm text-slate-500">
                {linkLabel}{" "}
                <Link to={linkTo} className="text-primary-600 hover:text-primary-700 font-medium">
                  {linkText}
                </Link>
              </span>
            </div>
            {children}
            {showApiKeyTip && (
              <p className="mt-10 text-xs text-slate-400">
                登录后可在用户菜单中查看或生成 API Key，供 Agent 与开放接口使用。
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
