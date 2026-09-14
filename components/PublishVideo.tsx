"use client";
import { useState } from "react";
import Link from "next/link";
import { useAccount } from "./AccountAccess";
type Row = {
  name: string;
  jerseyNumber?: string;
  made: number;
  knownPoints: number;
  unknownValue: number;
};
export function PublishVideo({ videoId }: { videoId: string }) {
  const { user } = useAccount();
  const [preview, setPreview] = useState<Row[] | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  if (user?.role !== "admin") return null;
  async function act(publish: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: publish ? "publish-video" : "preview-video",
          videoId,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (publish) {
        setPreview(null);
        setMessage(`已发布 ${data.count} 位球员的本视频统计。`);
      } else setPreview(data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "发布失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-panel p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mt-eyebrow">管理员 · 发布统计</p>
          <h3>把本场表现分享给所有人</h3>
          <p className="text-sm text-slate-500 mt-2">
            核对球员和得分后发布。重复发布本视频会更新已有统计，不会重复累计。
          </p>
        </div>
        <button
          className="mt-primary"
          disabled={busy}
          onClick={() => void act(false)}
        >
          预览并发布到公共技术看板
        </button>
      </div>
      {preview && (
        <div>
          <div className="mt-board-table">
            <table>
              <thead>
                <tr>
                  <th>球员</th>
                  <th>号码</th>
                  <th>进球</th>
                  <th>已判定得分</th>
                  <th>待判分进球</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i}>
                    <td>{p.name}</td>
                    <td>{p.jerseyNumber || "—"}</td>
                    <td>{p.made}</td>
                    <td>{p.knownPoints}</td>
                    <td>{p.unknownValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-slate-500 my-3">
            仅公开以上球员统计，视频和照片保持私有。确认时会读取最新分析结果。
          </p>
          <div className="flex gap-3">
            <button
              className="mt-primary"
              disabled={busy}
              onClick={() => void act(true)}
            >
              确认发布
            </button>
            <button
              className="mt-text-link"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status">
          {message}{" "}
          <Link className="mt-text-link" href="/board">
            查看公共技术看板
          </Link>
        </p>
      )}
    </section>
  );
}
