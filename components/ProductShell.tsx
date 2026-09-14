"use client";
import Link from "next/link";
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
} from "lucide-react";

const navigation = [
  { href: "/", label: "首页", subtitle: "工作空间概览", icon: LayoutDashboard },
  {
    href: "/statistics",
    label: "技术统计",
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
  const hosted = process.env.NEXT_PUBLIC_DEPLOYMENT === "server";
  const pathname = usePathname();
  const current = navigation.find((n) => n.href === pathname) || navigation[0];
  return (
    <div className="mt-app">
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
          {navigation.map(({ href, label, subtitle, icon: Icon }) => (
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
        </nav>
        <div className="mt-sidebar-bottom">
          <div className="mt-sidebar-note">
            <span className="mt-live-dot" />
            {hosted ? "团队试用工作空间" : "本地工作空间"}
            <p>
              {hosted
                ? "视频与记录保存在服务器，试用成员共享。"
                : "视频与记录保存在这台电脑。"}
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
            <span className="text-slate-400">工作空间</span>
            <ChevronRight size={14} className="text-slate-300" />
            <strong className="font-medium">{current.label}</strong>
          </div>
          <div className="flex items-center gap-5">
            <span className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
              <span className="mt-live-dot" />
              {hosted ? "服务器存储" : "本机存储"}
            </span>
            <details key={pathname} className="mt-help">
              <summary>
                <CircleHelp size={17} />
                <span>使用指南</span>
              </summary>
              <div>
                <strong>从一段比赛视频开始</strong>
                <p>技术统计：上传视频 → 开始分析 → 查看个人数据。</p>
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
              aria-label={hosted ? "团队试用工作空间" : "本地工作空间"}
            >
              MT
            </span>
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
