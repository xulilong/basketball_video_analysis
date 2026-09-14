"use client";
import { useState } from "react";
import type {
  SampleReview,
  SampleTracklet,
  ShotCandidate,
} from "@/lib/sample-review-types";
import { timeLabel } from "@/lib/scorebook";

export function SampleReviewPanel({
  videoKey,
  playerIds,
  eventIds,
  excludedIds,
  onExclude,
  onRestore,
  onAddPlayer,
  onSeek,
  onDraft,
}: {
  videoKey: string;
  playerIds: string[];
  eventIds: string[];
  excludedIds: string[];
  onExclude: (id: string) => void;
  onRestore: (id: string) => void;
  onAddPlayer: (track: SampleTracklet) => void;
  onSeek: (time: number) => void;
  onDraft: (shot: ShotCandidate) => void;
}) {
  const [data, setData] = useState<SampleReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sample-review");
      if (!response.ok) throw new Error("尚未找到此视频的本地初筛结果。");
      const report: SampleReview = await response.json();
      if (report.videoKey !== videoKey)
        throw new Error("初筛结果不属于当前视频，请重新打开本地视频。");
      setData(report);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="font-semibold">真实录像初筛 · 实验结果</h2>
          <p className="mt-1 text-xs text-slate-600">
            先核对人物片段和篮筐附近的动作，确认后才能进入个人统计。
          </p>
        </div>
        <button
          className="rounded-lg bg-blue-700 text-white px-4 py-2 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={load}
        >
          {busy ? "读取中…" : "载入本地初筛结果"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-700 text-sm">
          {error}
        </p>
      )}
      {data && (
        <>
          <p className="text-sm text-slate-600">
            人物跟踪范围：前 {timeLabel(data.trackingSeconds)}
            ；篮筐运动扫描范围：{timeLabel(data.scannedSeconds)}。通用跟踪输出的{" "}
            {data.processedFrames} 个抽样帧中，有 {data.ballFrames}{" "}
            帧包含篮球记录（不是识别准确率）。
          </p>
          <details>
            <summary className="cursor-pointer font-medium text-sm">
              球员候选 · {data.tracklets.length} 份截图（不代表已确认参赛人数）
            </summary>
            <p className="my-3 text-xs text-slate-500">
              {data.rosterSource}。原始跟踪产生 {data.rawTrackletCount}{" "}
              个片段；遮挡后编号可能断开，不能作为个人身份。请核对并排除旁观者后加入名单。
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-3">
              {data.tracklets.map((track) => (
                <div key={track.id} className="rounded-lg border bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={track.photo}
                    alt={`人物片段 ${track.id}`}
                    className="h-32 w-full object-contain"
                  />
                  <p className="text-xs font-semibold mt-2">{track.id}</p>
                  {track.label && (
                    <p className="text-xs text-slate-500">{track.label}</p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    {timeLabel(track.first)}–{timeLabel(track.last)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <button
                      className="text-blue-700"
                      onClick={() => onSeek(track.capturedAt)}
                    >
                      回看
                    </button>
                    <button
                      className="text-blue-700 disabled:text-slate-400"
                      disabled={playerIds.includes(`sample-${track.id}`)}
                      onClick={() => onAddPlayer(track)}
                    >
                      {playerIds.includes(`sample-${track.id}`)
                        ? "已添加"
                        : "加入名单"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </details>
          <details open>
            <summary className="cursor-pointer font-medium text-sm">
              篮筐动作候选 · {data.shots.length} 段（不是进球数）
            </summary>
            <p className="my-3 text-xs text-slate-500">
              仅通过篮网运动筛选，可能包括碰筐、擦网、死球投篮或抖动，也可能漏掉真实进球。回看出手前后，再填写得分者、分值和准确时间。
            </p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {data.shots.map((shot, i) => (
                <div
                  key={shot.id}
                  className="min-w-[150px] rounded-lg border bg-white p-3 text-xs"
                >
                  <p className="font-semibold">
                    片段 {i + 1} · {timeLabel(shot.timestamp)}
                  </p>
                  <p className="my-2 text-slate-500">
                    {timeLabel(shot.start)}–{timeLabel(shot.end)}
                  </p>
                  <div className="flex gap-3">
                    <button
                      className="text-blue-700"
                      onClick={() => onSeek(shot.start)}
                    >
                      回看
                    </button>
                    <button
                      className="text-blue-700 disabled:text-slate-400"
                      disabled={
                        eventIds.includes(`sample-${shot.id}`) ||
                        excludedIds.includes(shot.id)
                      }
                      onClick={() => onDraft(shot)}
                    >
                      {eventIds.includes(`sample-${shot.id}`)
                        ? "已建草稿"
                        : "建立待确认草稿"}
                    </button>
                  </div>
                  {excludedIds.includes(shot.id) ? (
                    <p className="mt-3 text-slate-500">
                      已排除，不计分{" "}
                      <button
                        className="text-blue-700"
                        onClick={() => onRestore(shot.id)}
                      >
                        恢复待核对
                      </button>
                    </p>
                  ) : (
                    <button
                      className="mt-3 text-amber-800"
                      title="排除此片段，并移除由它建立的记账记录"
                      onClick={() => onExclude(shot.id)}
                    >
                      排除：热身 / 死球 / 非进球
                    </button>
                  )}
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
