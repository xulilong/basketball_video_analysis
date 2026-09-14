"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Trophy, Search } from "lucide-react";
import { useAccount } from "./AccountAccess";
type HistoryRow = {
  id: string;
  name: string;
  average: number | null;
  attendance: number | null;
  tags: string[];
};
type VideoRow = {
  id: string;
  name: string;
  jerseyNumber?: string;
  videos: number;
  made: number;
  knownPoints: number;
  unknownValue: number;
  publishedAt: string;
  sourceKind?: string;
};
export function PublicLeaderboard() {
  const { user } = useAccount();
  const [history, setHistory] = useState<{
    rows: HistoryRow[];
    importedAt: string | null;
  }>({ rows: [], importedAt: null });
  const [videos, setVideos] = useState<VideoRow[]>([]),
    [tab, setTab] = useState("history"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("score"),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const responses = await Promise.all([
          fetch("/api/board/history", { cache: "no-store" }),
          fetch("/api/board", { cache: "no-store" }),
        ]);
        if (responses.some((r) => !r.ok))
          throw new Error("看板暂时无法读取，请稍后重试");
        const [h, v] = await Promise.all(responses.map((r) => r.json()));
        if (live) {
          setHistory(h);
          setVideos(v);
          setError("");
          setLoaded(true);
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "加载失败");
      }
    }
    void load();
    const timer = setInterval(load, 30000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  const names = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, "zh-CN");
  const historical = tab === "history";
  const hs = history.rows
    .filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      sort === "name"
        ? names(a, b)
        : sort === "attendance"
        ? (b.attendance ?? -1) - (a.attendance ?? -1) || names(a, b)
        : (b.average ?? -1) - (a.average ?? -1) || names(a, b)
    );
  const vs = videos
    .filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      sort === "name"
        ? names(a, b)
        : sort === "attendance"
        ? b.videos - a.videos || names(a, b)
        : b.knownPoints - a.knownPoints || names(a, b)
    );
  const leaders = historical
    ? [...history.rows]
        .filter((r) => r.average !== null)
        .sort((a, b) => b.average! - a.average!)
        .slice(0, 3)
        .map((r) => ({
          id: r.id,
          name: r.name,
          score: r.average,
          note: "场均得分 · 飞书历史记录",
        }))
    : [...videos]
        .sort((a, b) => b.knownPoints - a.knownPoints)
        .slice(0, 3)
        .map((r) => ({
          id: r.id,
          name: r.name,
          score: r.knownPoints,
          note: `已判定得分 · ${r.videos} 个视频`,
        }));
  return (
    <div className="space-y-6">
      <div className="mt-page-heading">
        <div>
          <p className="mt-eyebrow">MT BASKETBALL · TEAM LEADERBOARD</p>
          <h1>公共技术看板</h1>
          <p>每一次上场，都是新的积累。一起见证球员的进步。</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <span className="mt-pill">所有人可见</span>
          {user?.role === "admin" && (
            <Link href="/admin" className="mt-text-link">
              管理已发布数据 <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
      </div>
      <section className="mt-panel p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2>球队的共同记录，你的私有工作空间</h2>
          <p className="mt-2 text-sm text-slate-500">
            视频分析结果由管理员确认发布后展示在这里。
          </p>
        </div>
        <Link className="mt-primary" href="/statistics">
          {user?.role === "admin" ? "分析视频并发布" : "分析我的视频"}
          <ArrowUpRight size={16} />
        </Link>
      </section>
      <div className="mt-board-controls" role="group" aria-label="看板数据来源">
        <button
          className={historical ? "mt-primary" : "mt-secondary"}
          onClick={() => setTab("history")}
        >
          飞书历史数据
        </button>
        <button
          className={!historical ? "mt-primary" : "mt-secondary"}
          onClick={() => setTab("video")}
        >
          视频分析发布 · {videos.length}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-error">
          {error}
        </p>
      )}
      <p className="text-sm text-slate-500">
        {historical
          ? `展示球员数据表的场均得分、出勤次数与标签。${
              history.importedAt
                ? `最近导入：${new Date(history.importedAt).toLocaleString(
                    "zh-CN"
                  )}，当前为导入快照。`
                : "尚未导入历史记录。"
            }`
          : "同一档案的已发布视频统计持续累计；同名档案分别展示。账号累计快照单独标注，不与单视频记录相加。"}
      </p>
      {loaded && leaders.length > 0 && (
        <section className="mt-leaders" aria-label="得分前三名">
          {leaders.map((r, i) => (
            <article key={r.id} className="mt-leader">
              <div className="flex justify-between">
                <span>NO. {String(i + 1).padStart(2, "0")}</span>
                <Trophy size={20} />
              </div>
              <h2 className="mt-5">{r.name}</h2>
              <div className="mt-leader-score">
                {r.score}
                <small className="text-sm ml-2 font-normal">分</small>
              </div>
              <p className="text-xs opacity-70">{r.note}</p>
            </article>
          ))}
        </section>
      )}
      <section className="mt-panel p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2>
            球员表现{" "}
            <small className="text-slate-400">
              · {historical ? history.rows.length : videos.length} 条档案
            </small>
          </h2>
          <div className="mt-board-controls">
            <label className="flex items-center gap-2">
              <Search size={17} />
              <input
                aria-label="搜索球员"
                placeholder="搜索球员姓名"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="榜单排序"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="score">
                {historical ? "场均得分" : "已判定得分"}由高到低
              </option>
              <option value="attendance">
                {historical ? "出勤次数" : "视频数量"}由高到低
              </option>
              <option value="name">姓名首字母</option>
            </select>
          </div>
        </div>
        {!loaded ? (
          <div className="mt-empty">正在读取球员数据…</div>
        ) : (historical ? hs.length : vs.length) === 0 ? (
          <div className="mt-empty">
            {query
              ? "没有找到匹配的球员"
              : "暂无公开记录。管理员可在视频分析完成后发布统计。"}
          </div>
        ) : (
          <div className="mt-board-table">
            <table>
              <thead>
                <tr>
                  <th>序号</th>
                  <th>球员</th>
                  {historical ? (
                    <>
                      <th>场均得分</th>
                      <th>出勤次数</th>
                      <th>球员标签</th>
                    </>
                  ) : (
                    <>
                      <th>号码</th>
                      <th>已判定得分</th>
                      <th>进球数</th>
                      <th>待判分进球</th>
                      <th>视频数</th>
                      <th>数据来源</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {historical
                  ? hs.map((r, i) => (
                      <tr key={r.id}>
                        <td>{String(i + 1).padStart(2, "0")}</td>
                        <td>
                          <strong>{r.name}</strong>
                        </td>
                        <td>
                          <strong>{r.average ?? "—"}</strong>
                        </td>
                        <td>{r.attendance ?? "—"}</td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            {r.tags.length
                              ? r.tags.map((t) => (
                                  <span key={t} className="mt-pill">
                                    {t}
                                  </span>
                                ))
                              : "—"}
                          </div>
                        </td>
                      </tr>
                    ))
                  : vs.map((r, i) => (
                      <tr key={r.id}>
                        <td>{i + 1}</td>
                        <td>
                          <strong>{r.name}</strong>
                        </td>
                        <td>{r.jerseyNumber || "—"}</td>
                        <td>
                          <strong>{r.knownPoints}</strong>
                        </td>
                        <td>{r.made}</td>
                        <td>{r.unknownValue}</td>
                        <td>{r.videos}</td>
                        <td>
                          {r.sourceKind === "video"
                            ? "单视频累计"
                            : "账号累计快照"}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500">
          {historical
            ? "场均得分沿用飞书原表公式；空值表示暂无记录。出勤次数沿用原表，不能等同于比赛局数。球员标签中的“助攻”“篮板”表示特点，不代表统计次数。"
            : "只累计已判定的两分、三分，未判定分值的进球单独列出。视频及私人照片不会出现在公共看板。"}
        </p>
      </section>
    </div>
  );
}
