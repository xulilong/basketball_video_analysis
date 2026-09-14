"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { AutomaticScores as Report } from "@/lib/automatic-score-types";
const clock = (t: number) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(t % 60)
    .toString()
    .padStart(2, "0")}`;
export function AutomaticScores() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/automatic-scores", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  if (!report)
    return (
      <section className="rounded-2xl border bg-white p-8">
        <h2 className="text-xl font-bold">示例视频 · 已生成的分析结果</h2>
        <p className="my-4 text-slate-600">
          {loading ? "正在读取已生成的结果…" : error}
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg bg-orange-600 px-4 py-2 text-white"
        >
          重新读取结果
        </button>
      </section>
    );
  const estimated = report.events.filter((e) => e.status === "estimated");
  const excluded = report.events.filter((e) => e.status === "excluded");
  const unresolved = report.events.filter((e) => e.status === "unresolved");
  const min = report.players.reduce((n, p) => n + p.pointsMin, 0),
    max = report.players.reduce((n, p) => n + p.pointsMax, 0);
  const rows = [...report.players].sort(
    (a, b) => b.pointsMin - a.pointsMin || a.id.localeCompare(b.id)
  );
  return (
    <section className="space-y-6">
      <p className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
        当前仅展示示例视频的自动分析实验。新视频入口仍为辅助记分，尚不支持上传后自动生成个人数据。
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-orange-700">示例.mp4 · 已预先运行的本地分析</p>
          <h2 className="mt-2 text-3xl font-bold">示例得分 · 实验结果</h2>
          <p className="mt-2 text-sm text-slate-500">
            已分析 {clock(report.analyzedSeconds)}
            。下表读取已生成的结果，打开页面不会重新分析视频。
          </p>
        </div>
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify(report, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "自动得分估算.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
          className="rounded-lg border bg-white px-4 py-2 text-sm"
        >
          导出自动结果
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["已归属进球", `${estimated.length} 球`],
          [
            "已归属得分",
            estimated.length === 0
              ? "尚未得到"
              : min === max
              ? `${min} 分`
              : `${min}–${max} 分`,
          ],
          ["未能确定", `${unresolved.length} 球`],
          ["疑似非比赛排除", `${excluded.length} 球`],
        ].map(([title, value]) => (
          <div key={title} className="rounded-xl border bg-white p-5">
            <p className="text-xs text-slate-500">{title}</p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <strong>实验结果，存在漏记和误归属。</strong>{" "}
        得分区间表示部分投篮尚不能区分两分和三分。“—”表示当前尚无可计入的得分，不代表该球员实际没有得分。热身
        / 死球的自动排除仍不可靠。
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100">
            <tr>
              {[
                "球员",
                "自动估算得分",
                "计入进球",
                "明确两分",
                "明确三分",
                "分值未定",
              ].map((t) => (
                <th key={t} className="whitespace-nowrap p-4">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-4">
                  <div className="flex min-w-52 items-center gap-3">
                    <Image
                      unoptimized
                      width={56}
                      height={80}
                      src={p.photo}
                      alt={p.label}
                      className="h-20 w-14 rounded-lg bg-slate-100 object-contain"
                    />
                    <div>
                      <strong>{p.id}</strong>
                      <p className="mt-1 text-xs text-slate-500">{p.label}</p>
                    </div>
                  </div>
                </td>
                <td className="p-4 text-2xl font-bold text-orange-700">
                  {p.made === 0
                    ? "—"
                    : p.pointsMin === p.pointsMax
                    ? p.pointsMin
                    : `${p.pointsMin}–${p.pointsMax}`}
                </td>
                <td className="p-4">{p.made}</td>
                <td className="p-4">{p.two}</td>
                <td className="p-4">{p.three}</td>
                <td className="p-4">{p.unknownValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="rounded-xl border bg-white p-5">
        <summary className="cursor-pointer font-medium">
          算法说明与当前限制
        </summary>
        <p className="mt-3 text-sm text-slate-500">
          {report.rosterSource}。计分依据：篮球下穿网口 →
          手腕与球关联或连续投篮姿势 → 衣着模板匹配 → 场上运动状态过滤。
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {report.limitations.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </details>
      <details className="rounded-xl border bg-white p-5">
        <summary className="cursor-pointer font-medium">
          查看自动事件依据（可选）
        </summary>
        <video
          ref={video}
          src="/api/local-sample"
          controls
          preload="none"
          className="my-4 max-h-96 w-full rounded-lg bg-black"
        />
        <div className="divide-y">
          {report.events.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-3 py-3 text-sm"
            >
              <button
                className="text-blue-700 underline"
                onClick={() => {
                  if (video.current) {
                    video.current.currentTime = Math.max(
                      0,
                      (e.releaseTime ?? e.timestamp) - 2
                    );
                    void video.current.play().catch(() => {});
                  }
                }}
              >
                {clock(e.timestamp)}
              </button>
              <strong>{e.playerId ?? "归属未定"}</strong>
              <span>
                {e.status === "estimated"
                  ? `计入 ${e.points ?? "2–3"} 分`
                  : e.status === "excluded"
                  ? "自动排除"
                  : "未计入"}
              </span>
              <span className="text-xs text-slate-500">{e.reason}</span>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
