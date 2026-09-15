"use client";
import Link from "next/link";
import { useAccount } from "./AccountAccess";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  Clapperboard,
  Film,
  FolderOpen,
  Play,
  Upload,
  Users,
} from "lucide-react";
type Overview = {
  videoCount: number;
  analyzedCount: number;
  clipCount: number;
  recent: {
    id: string;
    name: string;
    createdAt: string;
    status: string;
    highlightStatus: string | null;
    clips: number;
    size: number;
  }[];
};
const statuses: Record<string, string> = {
  uploaded: "待分析",
  queued: "排队中",
  running: "分析中",
  complete: "分析完成",
  failed: "分析失败",
  cancelled: "已停止",
};
export function ProductHome() {
  const { user } = useAccount();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/overview", { cache: "no-store" });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setData(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (user) void load();
    else {
      setData(null);
      setLoading(false);
    }
  }, [user]);
  return (
    <div className="mt-home space-y-7">
      <div className="mt-page-heading">
        <div>
          <p className="mt-eyebrow">YOUR GAME. YOUR STORY.</p>
          <h1>每一次上场，都有迹可循。</h1>
          <p>从赛场表现到精彩瞬间，你的篮球记录从这里开始。</p>
        </div>
        <span className="mt-pill">
          <span className="mt-live-dot" />
          {user ? "我的篮球工作空间" : "欢迎来到 MT 篮球工作台"}
        </span>
      </div>
      <section className="mt-hero">
        <div className="mt-hero-content">
          <span className="mt-hero-tag">
            <span />
            为热爱篮球的你而造
          </span>
          <h2>
            让每次精彩进球，
            <br />
            都能够被<span>记录。</span>
          </h2>
          <p>
            上传一段比赛，记录个人表现，留住进球瞬间。
            <br className="hidden sm:block" />
            把场上的投入，变成看得见的回忆。
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/record" className="mt-primary">
              开启精彩记录 <ArrowUpRight size={17} />
            </Link>
            <Link href="/statistics" className="mt-hero-secondary">
              开始视频分析 <ArrowRight size={16} />
            </Link>
          </div>
          <div className="mt-hero-caption">
            <span>01 / ANALYZE</span>
            <i />
            <span>02 / HIGHLIGHTS</span>
          </div>
        </div>
        <div className="mt-court-art" aria-hidden="true">
          <div className="mt-court-glow" />
          <svg viewBox="0 0 500 460" fill="none">
            <g
              transform="translate(75 52) rotate(17 175 180)"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <rect x="5" y="5" width="310" height="405" rx="2" />
              <path
                d="M5 340H315 M5 305C155 305 315 305 315 110 M5 110C5 305 165 305 315 305"
                opacity="0"
              />
              <path d="M30 5V88A130 130 0 0 0 290 88V5" />
              <rect x="100" y="5" width="120" height="155" />
              <path d="M100 160A60 60 0 0 0 220 160" />
              <path d="M100 160A60 60 0 0 1 220 160" strokeDasharray="5 7" />
              <path d="M135 45H185" strokeWidth="3" />
              <circle cx="160" cy="58" r="11" />
              <path d="M5 410H315 M100 410A60 60 0 0 1 220 410" />
              <circle
                cx="230"
                cy="235"
                r="23"
                fill="#f4753c"
                stroke="#f4753c"
              />
              <path
                d="M207 235H253M230 212V258M214 219C232 228 228 243 214 251M247 219C228 228 232 243 247 251"
                stroke="#733820"
                strokeWidth="1.4"
              />
              <path
                d="M231 207C274 131 245 63 183 58"
                stroke="#fba477"
                strokeDasharray="5 7"
              />
              <circle cx="84" cy="247" r="5" fill="currentColor" />
              <circle cx="224" cy="100" r="5" fill="currentColor" />
            </g>
          </svg>
          <div className="mt-art-label">
            <span className="mt-live-dot" />
            MAKE EVERY SHOT COUNT.<small>属于你的比赛故事</small>
          </div>
        </div>
      </section>
      {user && (
        <section className="mt-overview-grid" aria-label="工作空间数据">
          {[
            {
              label: "已上传视频",
              value: data?.videoCount,
              unit: "个",
              icon: FolderOpen,
              note: "比赛记录，集中管理",
            },
            {
              label: "已完成技术分析",
              value: data?.analyzedCount,
              unit: "个",
              icon: BarChart3,
              note: "查看球员与个人得分",
            },
            {
              label: "已生成精彩片段",
              value: data?.clipCount,
              unit: "段",
              icon: Clapperboard,
              note: "每段精彩，都可导出",
            },
          ].map(({ label, value, unit, icon: Icon, note }) => (
            <div className="mt-metric" key={label}>
              <div>
                <p>{label}</p>
                <strong>
                  {loading ? "—" : value ?? "—"}
                  <small>{unit}</small>
                </strong>
                <span>{note}</span>
              </div>
              <div className="mt-metric-icon">
                <Icon size={21} strokeWidth={1.6} />
              </div>
            </div>
          ))}
        </section>
      )}
      {error && (
        <div role="alert" className="mt-error">
          {error}
          <button onClick={load} className="ml-4 underline">
            重新加载
          </button>
        </div>
      )}
      <section className="mt-panel p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mt-eyebrow">TEAM LEADERBOARD</p>
          <h2>公共技术看板 · 一起见证每次进步</h2>
          <p className="text-sm text-slate-500 mt-2">
            所有人都可查看已公开的球员表现，无需登录。
          </p>
        </div>
        <Link href="/board" className="mt-primary">
          查看球员榜单 <ArrowRight size={17} />
        </Link>
      </section>
      <section className="mt-panel p-6">
        <h2>
          {user?.role === "admin" ? "管理员工作流程" : "你的比赛记录，自己掌握"}
        </h2>
        <p className="mt-3 text-sm text-slate-500">
          {user?.role === "admin"
            ? "上传视频 → 开始分析 → 核对球员与得分 → 发布到公共技术看板"
            : "上传视频 → 开始分析 → 查看本视频中的球员与个人得分。视频和球员档案保存在你的私有工作空间。"}
        </p>
        <Link href="/players" className="mt-text-link mt-3">
          管理球员档案 <ArrowRight size={15} />
        </Link>
      </section>
      <section id="getting-started">
        <div className="mt-section-heading">
          <div>
            <h2>两个工作区，一段完整的比赛记忆</h2>
            <p>选择你想做的事，即刻开始。</p>
          </div>
          <span className="mt-small-label">THE WORKSPACE</span>
        </div>
        <div className="mt-feature-grid">
          <Link href="/statistics" className="mt-feature">
            <div className="flex items-center justify-between">
              <span className="mt-feature-icon">
                <BarChart3 size={25} />
              </span>
              <span className="mt-pill">数据分析 · 实验版</span>
            </div>
            <div>
              <span className="mt-small-label">01 / PLAYER ANALYTICS</span>
              <h3>视频分析</h3>
              <p>
                看见每一位球员的投入。识别视频中的人物，
                <br className="hidden xl:block" />
                整理个人得分，积累属于你们的比赛数据。
              </p>
            </div>
            <div className="mt-feature-tags">
              <span>
                <Users size={14} />
                球员档案
              </span>
              <span>
                <BarChart3 size={14} />
                个人得分
              </span>
              <span>
                <Check size={14} />
                跨视频累计
              </span>
            </div>
            <div className="mt-feature-bottom">
              进入视频分析 <ArrowRight size={19} />
            </div>
          </Link>
          <Link href="/highlights" className="mt-feature mt-feature-clips">
            <div className="flex items-center justify-between">
              <span className="mt-feature-icon">
                <Clapperboard size={25} />
              </span>
              <span className="mt-pill">自动剪辑</span>
            </div>
            <div>
              <span className="mt-small-label">02 / GAME HIGHLIGHTS</span>
              <h3>进球剪辑</h3>
              <p>
                不用反复拖动进度条。自动寻找进球瞬间，
                <br className="hidden xl:block" />
                剪成一支带原声的集锦，把精彩带离球场。
              </p>
            </div>
            <div className="mt-feature-tags">
              <span>
                <Film size={14} />
                自动成片
              </span>
              <span>
                <Play size={14} />
                在线预览
              </span>
              <span>
                <Check size={14} />
                MP4 导出
              </span>
            </div>
            <div className="mt-feature-bottom">
              制作进球集锦 <ArrowRight size={19} />
            </div>
          </Link>
        </div>
      </section>
      {user && (
        <section className="mt-panel">
          <div className="mt-panel-heading">
            <div>
              <h2>最近的视频</h2>
              <p>继续处理你的比赛记录。</p>
            </div>
            <Link href="/statistics" className="mt-text-link">
              全部视频 <ArrowUpRight size={16} />
            </Link>
          </div>
          {loading ? (
            <div className="mt-empty">正在读取比赛记录…</div>
          ) : data?.recent.length ? (
            <div className="mt-recent-list">
              {data.recent.map((v) => (
                <div key={v.id} className="mt-recent-row">
                  <div className="mt-video-icon">
                    <Film size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm" title={v.name}>
                      {v.name}
                    </strong>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(v.createdAt).toLocaleDateString("zh-CN")}
                      <span className="mx-2">·</span>
                      {(v.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  <span className="mt-status hidden sm:inline-flex">
                    {v.clips
                      ? `${v.clips} 段集锦`
                      : v.highlightStatus === "running"
                      ? "剪辑中"
                      : statuses[v.status] || "待处理"}
                  </span>
                  <Link
                    href={`/statistics?video=${v.id}`}
                    className="mt-recent-action"
                  >
                    统计 <ArrowUpRight size={14} />
                  </Link>
                  <Link
                    href={`/highlights?video=${v.id}`}
                    className="mt-recent-action"
                  >
                    剪辑 <ArrowUpRight size={14} />
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-empty">
              <Upload size={30} />
              <h3>第一段比赛，等你上传</h3>
              <p>上传视频后，你的比赛记录会出现在这里。</p>
              <Link href="/highlights" className="mt-primary">
                上传第一段视频 <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </section>
      )}
      <p className="mt-home-note">
        当前识别能力仍在完善，自动生成的球员、得分和进球片段可能有误差。请结合实际比赛查看结果。
      </p>
    </div>
  );
}
