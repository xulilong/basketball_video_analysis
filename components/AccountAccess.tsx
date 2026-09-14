"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
type User = { id: string; username: string; role: "admin" | "user" };
const AccountContext = createContext<{
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}>({ user: null, loading: true, logout: async () => {} });
export const useAccount = () => useContext(AccountContext);
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [register, setRegister] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  const pathname = usePathname();
  const notify = () => {
    const channel = new BroadcastChannel("mt-account-events");
    channel.postMessage("changed");
    channel.close();
  };
  useEffect(() => {
    const channel = new BroadcastChannel("mt-account-events");
    channel.onmessage = () => window.location.reload();
    return () => channel.close();
  }, []);

  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("账号服务暂时不可用");
        setUser((await r.json()).user);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function logout() {
    const r = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    if (r.ok) {
      notify();
      setUser(null);
      setPassword("");
      window.location.assign("/");
    }
  }
  const access = (
    <div className="mt-account-card mt-panel">
      <p className="mt-eyebrow">YOUR PRIVATE WORKSPACE</p>
      <h1>{register ? "创建试用账号" : "登录工作台"}</h1>
      <p>
        每个账号独立管理视频、球员档案和统计。管理员可选择统计数据发布到公共看板。
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: register ? "register" : "login",
                username,
                password,
              }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            notify();
            setPassword("");
            setUser(data.user);
          } catch (e) {
            setError(e instanceof Error ? e.message : "登录失败");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          用户名
          <input
            required
            minLength={2}
            maxLength={30}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          密码
          <input
            required
            minLength={8}
            maxLength={128}
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="mt-error">
            {error}
          </p>
        )}
        <button className="mt-primary" disabled={busy}>
          {busy ? "请稍候…" : register ? "创建并进入" : "登录"}
        </button>
      </form>
      <div className="mt-account-links">
        <button
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register ? "已有账号，去登录" : "首次使用，创建账号"}
        </button>
        <Link href="/board">查看公共统计看板</Link>
      </div>
      <button
        className="mt-text-link"
        onClick={() => {
          setRegister(false);
          setUsername("admin");
          setError("");
        }}
      >
        管理员登录
      </button>
    </div>
  );
  return (
    <AccountContext.Provider value={{ user, loading, logout }}>
      {loading ? (
        <div className="mt-empty">正在连接工作台…</div>
      ) : user || pathname === "/board" || pathname === "/" ? (
        children
      ) : (
        access
      )}
    </AccountContext.Provider>
  );
}
