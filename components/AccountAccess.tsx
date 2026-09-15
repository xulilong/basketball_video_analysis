"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  accountChannel,
  notifyAccountChange,
  accountRequest,
} from "@/lib/account-client";
type User = { id: string; username: string; role: "admin" | "user" };
const AccountContext = createContext<{
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}>({ user: null, loading: true, logout: async () => {} });
export const useAccount = () => useContext(AccountContext);
export function AccountProvider({
  children,
  independent = false,
}: {
  children: React.ReactNode;
  independent?: boolean;
}) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [register, setRegister] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  const pathname = usePathname();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const channel = accountChannel(() => window.location.reload());
    return () => channel?.close();
  }, []);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    accountRequest()
      .then((data) => {
        if (live) setUser(data.user);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  useEffect(() => {
    document.documentElement.dataset.mtReady = loading ? "loading" : "ready";
  }, [loading]);
  async function logout() {
    try {
      await accountRequest({ action: "logout" });
      notifyAccountChange();
      setUser(null);
      setPassword("");
      window.location.assign("/");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "退出失败，请重试");
    }
  }
  const access = (
    <div className="mt-account-card mt-panel">
      <p className="mt-eyebrow">YOUR PRIVATE WORKSPACE</p>
      <h1>
        {register ? "创建账号" : independent ? "登录球场时刻" : "登录工作台"}
      </h1>
      <p>
        {independent
          ? "登录后管理你的个人档案、比赛记录和精彩集锦。"
          : "每个账号独立管理视频、球员档案和统计。管理员可选择统计数据发布到公共看板。"}
      </p>
      {independent && pathname === "/join" && (
        <a
          className="mt-primary"
          href={`courtmoments://join${
            typeof window !== "undefined" ? window.location.search : ""
          }`}
        >
          已安装？在 App 中加入球局
        </a>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const data = await accountRequest({
              action: register ? "register" : "login",
              username,
              password,
            });
            notifyAccountChange();
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
          <div role="alert" className="mt-error">
            <p>{error}</p>
            <button
              type="button"
              className="mt-text-link"
              onClick={() => setAttempt((n) => n + 1)}
            >
              重新连接
            </button>
          </div>
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
        {!independent && <Link href="/board">查看公共统计看板</Link>}
      </div>
      {!independent && (
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
      )}
    </div>
  );
  return (
    <AccountContext.Provider value={{ user, loading, logout }}>
      {loading ? (
        <div className="mt-empty" role="status">
          <p>{independent ? "正在连接球场时刻…" : "正在连接工作台…"}</p>
          <p className="text-sm text-slate-500 mt-3">
            首次打开需要加载页面，连接超时后可以重试。
          </p>
          <a href="" className="mt-text-link mt-4">
            重新加载
          </a>
        </div>
      ) : user ||
        (!independent && pathname === "/board") ||
        pathname === "/" ||
        pathname === "/app" ? (
        children
      ) : (
        access
      )}
    </AccountContext.Provider>
  );
}
