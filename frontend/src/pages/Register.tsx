import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api/auth";
import AuthLayout from "../components/AuthLayout";

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authApi.register({ username, email, password });
      navigate("/login");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data
        ?.detail;
      setError(typeof detail === "string" ? detail : "注册失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="注册"
      linkLabel="已有账号？"
      linkTo="/login"
      linkText="点此登录"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">用户名</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            required
            minLength={8}
          />
          <p className="mt-1 text-xs text-slate-500">密码不少于 8 位</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "注册中..." : "立即注册"}
        </button>
      </form>
    </AuthLayout>
  );
}
