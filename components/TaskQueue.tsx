"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, ListOrdered, Activity, Clock3 } from "lucide-react";
import { useAccount } from "./AccountAccess";
import type { QueueTask } from "@/lib/task-queue";
type Snapshot = {
  active: QueueTask[];
  recent: QueueTask[];
  warnings: string[];
  counts: { running: number; queued: number };
  updatedAt: string;
};
const kinds = {
  analysis: "视频分析",
  highlights: "进球剪辑",
  selection: "选中片段导出",
};
const statuses: Record<string, string> = {
  running: "处理中",
  queued: "等待中",
  complete: "已完成",
  failed: "异常",
  cancelled: "已停止",
};
export function TaskQueue() {
  const { user } = useAccount();
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((n) => n + 1), []);
  useEffect(() => {
    if (user?.role !== "admin") return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      if (live) setLoading(true);
      try {
        const r = await fetch("/api/admin/queue", { cache: "no-store" });
        const value = await r.json();
        if (!r.ok) throw new Error(value.error);
        if (live) {
          setData(value);
          setError("");
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "读取失败");
      } finally {
        if (live) {
          setLoading(false);
          timer = setTimeout(load, 3000);
        }
      }
    }
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [user?.role, refresh]);
  if (user?.role !== "admin")
    return <div className="mt-panel mt-empty">此页面仅管理员可访问。</div>;
  function table(rows: QueueTask[]) {
    return (
      <div className="mt-board-table">
        <table>
          <thead>
            <tr>
              <th>视频 / 任务</th>
              <th>账号</th>
              <th>状态</th>
              <th>进度</th>
              <th>处理情况</th>
              <th>最近更新</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong
                    className="block max-w-64 truncate"
                    title={t.videoName}
                  >
                    {t.videoName}
                  </strong>
                  <small className="text-slate-500">{kinds[t.kind]}</small>
                </td>
                <td>{t.username}</td>
                <td>
                  <span className="mt-pill">
                    {statuses[t.status] || t.status}
                  </span>
                </td>
                <td>
                  {t.status === "queued" ? (
                    "等待资源"
                  ) : (
                    <div className="min-w-24">
                      <strong>{t.percent}%</strong>
                      <progress
                        className="block w-24 accent-orange-500"
                        value={t.percent}
                        max={100}
                      />
                    </div>
                  )}
                </td>
                <td>
                  <p className="max-w-sm text-sm">{t.message}</p>
                  {t.elapsedSeconds !== null && (
                    <small className="text-slate-500">
                      处理用时 {Math.floor(t.elapsedSeconds / 60)} 分{" "}
                      {Math.floor(t.elapsedSeconds % 60)} 秒
                    </small>
                  )}
                </td>
                <td className="whitespace-nowrap text-xs text-slate-500">
                  {t.updatedAt
                    ? new Date(t.updatedAt).toLocaleString("zh-CN")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="mt-page-heading">
        <div>
          <p className="mt-eyebrow">ADMIN · LOCAL TASK QUEUE</p>
          <h1>任务队列</h1>
          <p>查看本机所有账号的视频处理任务。</p>
        </div>
        <button className="mt-primary" disabled={loading} onClick={reload}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          刷新队列
        </button>
      </div>
      <div className="mt-overview-grid">
        {[
          { label: "正在处理", value: data?.counts.running, icon: Activity },
          { label: "等待资源", value: data?.counts.queued, icon: Clock3 },
          { label: "当前任务", value: data?.active.length, icon: ListOrdered },
        ].map(({ label, value, icon: Icon }) => (
          <div className="mt-metric" key={label}>
            <div>
              <p>{label}</p>
              <strong>
                {value ?? "—"}
                <small>个</small>
              </strong>
            </div>
            <div className="mt-metric-icon">
              <Icon size={21} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-500">
        每 3
        秒自动刷新。视频分析与进球剪辑共用处理资源，等待中的任务会自动启动；选中片段导出单独执行。列表顺序不代表严格的执行顺序。
      </p>
      {error && (
        <p role="alert" className="mt-error">
          {error}，当前显示的可能是上次读取结果。
        </p>
      )}
      {data?.warnings.map((w) => (
        <p className="mt-error" key={w}>
          {w}
        </p>
      ))}
      <section className="mt-panel p-6 space-y-4">
        <h2>正在处理与等待中的任务</h2>
        {!data ? (
          <div className="mt-empty">正在读取队列…</div>
        ) : data.active.length ? (
          table(data.active)
        ) : (
          <div className="mt-empty">
            <ListOrdered size={28} />
            <h3>当前没有排队任务</h3>
            <p>有新的分析、剪辑或导出任务时，会自动显示在这里。</p>
          </div>
        )}
      </section>
      <section className="mt-panel p-6 space-y-4">
        <h2>
          最近结束的任务 <small className="text-slate-400">最多 30 条</small>
        </h2>
        <p className="text-xs text-slate-500">
          展示各视频最近一次任务及导出记录，已清理的素材不再显示。
        </p>
        {data?.recent.length ? (
          table(data.recent)
        ) : (
          <p className="text-sm text-slate-500">暂无已结束的任务。</p>
        )}
      </section>
      <p className="text-xs text-slate-400">
        最近读取：
        {data ? new Date(data.updatedAt).toLocaleTimeString("zh-CN") : "—"}
      </p>
    </div>
  );
}
