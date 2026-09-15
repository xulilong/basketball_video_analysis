"use client";
import Link from "next/link";
import { useAccount } from "./AccountAccess";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  Clapperboard,
  HardDrive,
  LayoutDashboard,
  CircleHelp,
  Users,
  ListOrdered,
} from "lucide-react";

const navigation = [
  {
    href: "/",
    label: "首页",
    subtitle: "篮球记录，从这里开始",
    icon: LayoutDashboard,
  },
  {
    href: "/board",
    label: "公共技术看板",
    subtitle: "管理员发布的公开统计",
    icon: BarChart3,
  },
  {
    href: "/statistics",
    label: "视频分析",
    subtitle: "记录每个人的表现",
    icon: BarChart3,
  },
  {
    href: "/highlights",
    label: "进球剪辑",
    subtitle: "留住场上的高光",
    icon: Clapperboard,
  },
  {
    href: "/players",
    label: "球员档案",
    subtitle: "管理你的球队名单",
    icon: Users,
  },
];
export function ProductShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAccount();
  const pathname = usePathname();
  const current = navigation.find((n) => n.href === pathname) || {
    label:
      pathname === "/record"
        ? "开启精彩记录"
        : pathname === "/join"
        ? "加入球局"
        : pathname === "/admin/queue"
        ? "任务队列"
        : pathname === "/admin"
        ? "管理员发布"
        : pathname === "/library"
        ? "本地资料"
        : "首页",
  };
  return (
    <div
      className={`mt-app ${
        ["/record", "/join"].includes(pathname) ? "mt-record-shell" : ""
      }`}
    >
      <a href="#main-content" className="mt-skip">
        跳至主要内容
      </a>
      <aside className="mt-sidebar">
        <Link href="/" aria-label="MT球员统计工作台首页" className="mt-brand">
          <span className="mt-brand-mark">
            MT
            <span />
          </span>
          <div>
            <strong>球员统计工作台</strong>
            <small>BASKETBALL WORKSPACE</small>
          </div>
        </Link>
        <div className="mt-nav-label">工作空间</div>
        <nav aria-label="主导航" className="mt-nav">
          {navigation
            .slice(0, 2)
            .map(({ href, label, subtitle, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                className={pathname === href ? "active" : ""}
              >
                <Icon size={20} strokeWidth={1.7} />
                <span>
                  <strong>{label}</strong>
                  <small>{subtitle}</small>
                </span>
                {pathname === href && <span className="mt-nav-dot" />}
              </Link>
            ))}
          <div className="mt-tool-group">
            <div className="mt-tool-group-title">统计工具</div>
            <div className="mt-tool-children">
              {navigation
                .slice(2)
                .map(({ href, label, subtitle, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    aria-current={pathname === href ? "page" : undefined}
                    className={pathname === href ? "active" : ""}
                  >
                    <Icon size={18} />
                    <span>
                      <strong>{label}</strong>
                      <small>{subtitle}</small>
                    </span>
                  </Link>
                ))}
            </div>
          </div>
          {user && <div className="mt-tool-group-title">资料与管理</div>}
          {user && (
            <Link
              href="/library"
              className={pathname === "/library" ? "active" : ""}
            >
              <HardDrive size={20} />
              <span>
                <strong>本地资料</strong>
                <small>保存到浏览器的视频</small>
              </span>
            </Link>
          )}
          {user?.role === "admin" && (
            <Link
              href="/admin/queue"
              aria-current={pathname === "/admin/queue" ? "page" : undefined}
              className={pathname === "/admin/queue" ? "active" : ""}
            >
              <ListOrdered size={20} />
              <span>
                <strong>任务队列</strong>
                <small>本机处理进度与等待任务</small>
              </span>
            </Link>
          )}
          {user?.role === "admin" && (
            <Link
              href="/admin"
              className={pathname === "/admin" ? "active" : ""}
            >
              <Users size={20} />
              <span>
                <strong>管理员入口</strong>
                <small>选择并发布用户统计</small>
              </span>
            </Link>
          )}
        </nav>
        <div className="mt-sidebar-bottom">
          <div className="mt-sidebar-note">
            <span className="mt-live-dot" />
            {user ? `${user.username} 的私有空间` : "公共统计看板"}
            <p>
              {user
                ? "仅你和管理员可访问私有数据。"
                : "仅展示管理员已发布的统计。"}
              <br />
              每一次上场，都值得被记录。
            </p>
            <HardDrive size={18} />
          </div>
          <p className="mt-sidebar-footer">
            MT SPORTS <span>一起上场，一起留下精彩。</span>
          </p>
        </div>
      </aside>
      <div className="mt-body">
        <header className="mt-topbar">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/" className="text-slate-400">
              {["/statistics", "/highlights", "/players"].includes(pathname)
                ? "统计工具"
                : "工作空间"}
            </Link>
            <ChevronRight size={14} className="text-slate-300" />
            <strong className="font-medium">{current.label}</strong>
          </div>
          <div className="flex items-center gap-5">
            <span className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
              <span className="mt-live-dot" />
              {user ? "账号数据隔离" : "公开统计"}
            </span>
            <details key={pathname} className="mt-help">
              <summary>
                <CircleHelp size={17} />
                <span>使用指南</span>
              </summary>
              <div>
                <strong>从一段比赛视频开始</strong>
                <p>视频分析：上传视频 → 开始分析 → 查看个人数据。</p>
                <p>进球剪辑：上传视频 → 自动剪辑 → 预览并导出 MP4。</p>
                <p>
                  支持 MP4、MOV、WebM、MKV，单个文件最大 500
                  MB。推荐固定机位，完整拍到球场和篮筐。
                </p>
                <Link href="/#getting-started">
                  查看功能介绍 <ArrowUpRight size={14} />
                </Link>
              </div>
            </details>
            <span
              className="mt-avatar"
              aria-label={user ? `${user.username} 的私有空间` : "公共统计看板"}
            >
              {user?.username.slice(0, 2) || "MT"}
            </span>
            {user ? (
              <button className="mt-text-link" onClick={() => void logout()}>
                退出
              </button>
            ) : (
              <Link href="/statistics">登录 / 注册</Link>
            )}
          </div>
        </header>
        <main id="main-content" className="mt-main">
          {children}
        </main>
        <footer className="mt-footer">
          <span>MT球员统计工作台</span>
          <span>让每次精彩进球，都能够被记录。</span>
        </footer>
      </div>
    </div>
  );
}
