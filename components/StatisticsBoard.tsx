"use client";
import { useEffect, useState } from "react";
import { useAccount } from "./AccountAccess";
import type { PersonStats } from "@/lib/workbench-types";
type Row = {
  id: string;
  name: string;
  jerseyNumber?: string;
  videos: number;
  made: number;
  knownPoints: number;
  unknownValue: number;
  publishedAt: string;
  sourceUserId?: string;
  sourcePersonId?: string;
};
export function StatisticsBoard({ admin = false }: { admin?: boolean }) {
  const { user } = useAccount();
  const [rows, setRows] = useState<Row[]>([]),
    [users, setUsers] = useState<{ id: string; username: string }[]>([]),
    [selected, setSelected] = useState(""),
    [stats, setStats] = useState<PersonStats[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [notice, setNotice] = useState("");
  async function refresh() {
    const r = await fetch(
      admin ? `/api/admin/board?user=${selected}` : "/api/board",
      { cache: "no-store" }
    );
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    if (admin) {
      setUsers(data.users);
      setStats(data.stats);
      setRows(data.published);
    } else setRows(data);
    setLoaded(true);
  }
  useEffect(() => {
    let live = true;
    setBusy(true);
    setStats([]);
    const load = async () => {
      try {
        const r = await fetch(
          admin ? `/api/admin/board?user=${selected}` : "/api/board",
          { cache: "no-store" }
        );
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (live) {
          if (admin) {
            setUsers(data.users);
            setStats(data.stats);
            setRows(data.published);
          } else setRows(data);
          setLoaded(true);
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (live) setBusy(false);
      }
    };
    void load();
    const timer = admin ? undefined : setInterval(load, 30000);
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
  }, [admin, selected]);
  async function act(body: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/admin/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      await refresh();
      setNotice("公共看板已更新");
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败");
    } finally {
      setBusy(false);
    }
  }
  if (admin && user?.role !== "admin")
    return <div className="mt-panel mt-empty">此页面仅管理员可访问。</div>;
  return (
    <div className="space-y-6">
      <div className="mt-page-heading">
        <div>
          <p className="mt-eyebrow">
            {admin ? "PUBLISH & REVIEW" : "TEAM STATISTICS"}
          </p>
          <h1>{admin ? "管理员发布中心" : "公共统计看板"}</h1>
          <p>
            {admin
              ? "选择账号与球员，发布一份统计快照；用户的后续修改不会自动公开。"
              : "这里仅显示管理员已发布的数据，不包含私人视频和球员照片。"}
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {admin && (
        <section className="mt-panel p-6 space-y-4">
          <label className="mt-roster-sort">
            用户账号
            <select
              aria-label="选择用户账号"
              disabled={busy}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">请选择账号</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
          </label>
          <p>
            发布字段：姓名、球衣号码、视频数、已判定得分、进球数、待判分进球数。重复发布同一档案会覆盖旧快照。
          </p>
          <div className="mt-board-table">
            <table>
              <thead>
                <tr>
                  <th>球员</th>
                  <th>号码</th>
                  <th>已判定得分</th>
                  <th>待判分进球</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.jerseyNumber || "—"}</td>
                    <td>{p.knownPoints}</td>
                    <td>{p.unknownValue}</td>
                    <td>
                      <button
                        className="mt-text-link"
                        disabled={busy}
                        onClick={() =>
                          void act({
                            action: "publish",
                            userId: selected,
                            personId: p.id,
                          })
                        }
                      >
                        {rows.some(
                          (r) =>
                            r.sourceUserId === selected &&
                            r.sourcePersonId === p.id
                        )
                          ? "同步最新统计"
                          : "发布到看板"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected && !busy && !stats.length && (
            <p>这个账号还没有球员统计。</p>
          )}
        </section>
      )}
      <section className="mt-panel p-6">
        <h2>
          {admin ? "已发布的统计" : "球员表现"}{" "}
          <small>· {rows.length} 位</small>
        </h2>
        <p className="my-3 text-sm text-slate-500">
          得分只累计已判定分值，待判分进球单独列出；同名档案不会自动合并。
        </p>
        {!loaded ? (
          <p>正在读取统计…</p>
        ) : !rows.length ? (
          <div className="mt-empty">管理员尚未发布统计数据。</div>
        ) : (
          <div className="mt-board-table">
            <table>
              <thead>
                <tr>
                  <th>球员</th>
                  <th>号码</th>
                  <th>视频数</th>
                  <th>进球数</th>
                  <th>已判定得分</th>
                  <th>待判分进球</th>
                  <th>发布时间</th>
                  {admin && <th>操作</th>}
                </tr>
              </thead>
              <tbody>
                {[...rows]
                  .sort((a, b) => b.knownPoints - a.knownPoints)
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{r.jerseyNumber || "—"}</td>
                      <td>{r.videos}</td>
                      <td>{r.made}</td>
                      <td>
                        <strong>{r.knownPoints}</strong>
                      </td>
                      <td>{r.unknownValue}</td>
                      <td>{new Date(r.publishedAt).toLocaleString("zh-CN")}</td>
                      {admin && (
                        <td>
                          <button
                            className="mt-text-link"
                            disabled={busy}
                            onClick={() =>
                              void act({ action: "unpublish", id: r.id })
                            }
                          >
                            撤回公开
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
