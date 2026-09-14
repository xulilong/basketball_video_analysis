"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  Camera,
  ScanSearch,
  Users,
  Plus,
  Download,
  ArrowLeft,
  Trash2,
  Play,
} from "lucide-react";
import { cropPhoto, detectPeople, snapshot } from "@/lib/player-detector";
import type { Box } from "@/lib/player-detector";
import {
  emptyBook,
  EVENT_LABELS,
  mergePlayers,
  removePlayer,
  statistics,
  statsCSV,
  timeLabel,
} from "@/lib/scorebook";
import type {
  EventKind,
  LedgerEvent,
  RosterPlayer,
  Scorebook,
} from "@/lib/scorebook";
import { loadBook, saveBook } from "@/lib/scorebook-storage";
import { SampleReviewPanel } from "./SampleReviewPanel";
import { excludeCandidate } from "@/lib/scorebook";

interface Candidate {
  id: string;
  box: Box;
  confidence: number;
  photo: string;
  added?: boolean;
}
const button =
  "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed";
const primary = `${button} bg-slate-900 text-white hover:bg-slate-700 border-slate-900`;
const input = "w-full rounded-lg border bg-white px-3 py-2 text-sm";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PlayerScorebook({
  src,
  filename,
  storageKey,
  localReview = false,
  onBack,
}: {
  src: string;
  filename: string;
  storageKey: string;
  localReview?: boolean;
  onBack: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const frameCanvas = useRef<HTMLCanvasElement | null>(null);
  const alive = useRef(true);
  const detecting = useRef(false);
  const [book, setBook] = useState<Scorebook>(emptyBook);
  const [ready, setReady] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [saved, setSaved] = useState("正在读取本地记录…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState("");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [frame, setFrame] = useState<{
    url: string;
    time: number;
    width: number;
    height: number;
  } | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [drag, setDrag] = useState<{
    start: [number, number];
    end: [number, number];
  } | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<LedgerEvent | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveVersion = useRef(0);
  const selectedPlayer = book.players.find((p) => p.id === selected);
  const rows = useMemo(() => statistics(book), [book]);
  const pending = book.events.filter((e) => !e.confirmed || !e.playerId).length;

  useEffect(() => {
    alive.current = true;
    let active = true;
    loadBook(storageKey)
      .then((stored) => {
        if (!active) return;
        if (stored) {
          setBook(stored);
          setSelected(stored.players[0]?.id ?? "");
        }
        setSaved(stored ? "已恢复本视频的本地记录" : "记录保存在当前浏览器");
        setCanSave(true);
        setReady(true);
      })
      .catch(() => {
        if (active) {
          setError("无法读取本地记录。仍可记分，请导出 JSON 备份。");
          setSaved("自动保存不可用，请导出备份");
          setReady(true);
        }
      });
    return () => {
      active = false;
      alive.current = false;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!ready || !canSave) return;
    const version = ++saveVersion.current;
    setSaved("保存中…");
    // Serialize writes; an older snapshot must never overwrite a newer edit.
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => saveBook(storageKey, book));
    saveQueue.current
      .then(() => {
        if (alive.current && version === saveVersion.current)
          setSaved("已保存到当前浏览器");
      })
      .catch(() => {
        if (alive.current && version === saveVersion.current)
          setSaved("保存失败，请立即导出 JSON 备份");
      });
  }, [book, ready, canSave, storageKey]);

  function seek(time: number) {
    if (video.current) {
      video.current.pause();
      video.current.currentTime = Math.min(duration, Math.max(0, time));
      setCurrentTime(video.current.currentTime);
    }
  }

  async function capture(auto: boolean) {
    if (!video.current || detecting.current) return;
    detecting.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setCandidates([]);
    setDrag(null);
    setManual(!auto);
    try {
      video.current.pause();
      const canvas = snapshot(video.current);
      frameCanvas.current = canvas;
      setFrame({
        url: canvas.toDataURL("image/jpeg", 0.9),
        time: video.current.currentTime,
        width: canvas.width,
        height: canvas.height,
      });
      if (auto) {
        const results = await detectPeople(canvas);
        if (!alive.current) return;
        setCandidates(
          results.map((result) => ({
            ...result,
            id: crypto.randomUUID(),
            photo: cropPhoto(canvas, result.box),
          }))
        );
        setNotice(
          results.length
            ? `检测到 ${results.length} 位候选人物。请排除裁判、观众，并确认哪些是球员。`
            : "这一帧未检测到人物。可换一帧重试，或手动框选球员。"
        );
        if (!results.length) setManual(true);
      }
    } catch (e) {
      if (alive.current) {
        setError(
          `检测失败：${
            e instanceof Error ? e.message : String(e)
          }。可以直接手动框选。`
        );
        setManual(true);
      }
    } finally {
      detecting.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function addCandidate(candidate: Candidate) {
    if (candidate.added || !frame) return;
    const id = crypto.randomUUID();
    setBook((b) => ({
      ...b,
      players: [
        ...b.players,
        {
          id,
          name: `球员 ${b.players.length + 1}`,
          jersey: "",
          team: "待分队",
          photo: candidate.photo,
          capturedAt: frame.time,
        },
      ],
    }));
    setSelected(id);
    setMergeTarget("");
    setCandidates((list) =>
      list.map((c) => (c.id === candidate.id ? { ...c, added: true } : c))
    );
  }

  function point(e: PointerEvent<HTMLDivElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    ];
  }
  function finishDrag(e: PointerEvent<HTMLDivElement>) {
    if (!drag || !frame || !frameCanvas.current) return;
    const end = point(e);
    const box: Box = [
      Math.min(drag.start[0], end[0]) * frame.width,
      Math.min(drag.start[1], end[1]) * frame.height,
      Math.abs(drag.start[0] - end[0]) * frame.width,
      Math.abs(drag.start[1] - end[1]) * frame.height,
    ];
    setDrag(null);
    if (box[2] < 10 || box[3] < 10) {
      setNotice("请拖出一个覆盖球员身体的矩形。");
      return;
    }
    setCandidates((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        box,
        confidence: 1,
        photo: cropPhoto(frameCanvas.current!, box),
      },
    ]);
  }

  function updatePlayer(update: Partial<RosterPlayer>) {
    setBook((b) => ({
      ...b,
      players: b.players.map((p) =>
        p.id === selected ? { ...p, ...update } : p
      ),
    }));
  }
  function record(kind: EventKind) {
    if (!video.current) return;
    video.current.pause();
    const event: LedgerEvent = {
      id: crypto.randomUUID(),
      kind,
      timestamp: video.current.currentTime,
      playerId: selectedPlayer?.id ?? null,
      confirmed: !!selectedPlayer,
      note: "",
    };
    setBook((b) => ({ ...b, events: [...b.events, event] }));
    setNotice(
      `${timeLabel(event.timestamp)} · ${EVENT_LABELS[kind]} · ${
        selectedPlayer?.name || "待分配球员"
      }。可在下方事件列表修改或删除。`
    );
  }
  function saveEvent() {
    if (
      !editing ||
      !Number.isFinite(editing.timestamp) ||
      editing.timestamp < 0 ||
      editing.timestamp > duration
    ) {
      setError("事件时间必须在视频时长范围内。");
      return;
    }
    const validPlayer = book.players.some((p) => p.id === editing.playerId);
    setBook((b) => ({
      ...b,
      events: b.events.map((e) =>
        e.id === editing.id
          ? {
              ...editing,
              playerId: validPlayer ? editing.playerId : null,
              confirmed: validPlayer && editing.confirmed,
            }
          : e
      ),
    }));
    setEditing(null);
    setError("");
  }
  const shownEvents = [...book.events]
    .filter(
      (e) =>
        filter === "all" ||
        (filter === "pending"
          ? !e.confirmed || !e.playerId
          : e.playerId === filter)
    )
    .sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className={button}
          onClick={onBack}
          disabled={busy || saved === "保存中…"}
        >
          <ArrowLeft size={16} />
          更换视频
        </button>
        <div className="text-right text-xs text-slate-500">
          <p className="max-w-sm truncate font-medium text-slate-800">
            {filename}
          </p>
          <p role="status">{saved}</p>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      {localReview && ready && (
        <SampleReviewPanel
          videoKey={storageKey}
          playerIds={book.players.map((p) => p.id)}
          eventIds={book.events.map((e) => e.id)}
          excludedIds={book.excludedCandidates || []}
          onExclude={(id) => setBook((b) => excludeCandidate(b, id))}
          onRestore={(id) =>
            setBook((b) => ({
              ...b,
              excludedCandidates: b.excludedCandidates?.filter((x) => x !== id),
            }))
          }
          onSeek={seek}
          onAddPlayer={(track) => {
            const id = `sample-${track.id}`;
            setBook((b) =>
              b.players.some((p) => p.id === id)
                ? b
                : {
                    ...b,
                    players: [
                      ...b.players,
                      {
                        id,
                        name: `${track.id}${
                          track.label ? ` ${track.label}` : "（待确认）"
                        }`,
                        jersey: "",
                        team: "待分队",
                        photo: track.photo,
                        capturedAt: track.capturedAt,
                      },
                    ],
                  }
            );
            setSelected(id);
            setNotice(
              "已加入候选球员，请确认姓名；同一人的多个轨迹片段可以合并。"
            );
          }}
          onDraft={(shot) => {
            const draft: LedgerEvent = {
              id: `sample-${shot.id}`,
              timestamp: shot.timestamp,
              playerId: null,
              kind: "two",
              confirmed: false,
              note: "篮筐动作初筛草稿：是否进球、分值和得分者均未确认，时间为运动峰值。",
            };
            setBook((b) =>
              b.events.some((e) => e.id === draft.id)
                ? b
                : { ...b, events: [...b.events, draft] }
            );
            setEditing(draft);
            seek(shot.start);
          }}
        />
      )}
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className="rounded-2xl border bg-white p-4 sm:p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">01 / 找到画面中的球员</h2>
            <span className="text-xs text-slate-500">
              {timeLabel(currentTime)} / {timeLabel(duration)}
            </span>
          </div>
          <video
            ref={video}
            src={src}
            controls
            playsInline
            preload="auto"
            className="w-full max-h-[440px] rounded-xl bg-black"
            onLoadedMetadata={() => setDuration(video.current?.duration || 0)}
            onTimeUpdate={() => setCurrentTime(video.current?.currentTime || 0)}
            onError={() =>
              setError("视频无法解码，请使用浏览器支持的 MP4（H.264）视频。")
            }
          />
          <div className="flex flex-wrap gap-2">
            <button
              className={primary}
              disabled={busy || !duration || !ready}
              onClick={() => capture(true)}
            >
              <ScanSearch size={16} />
              {busy ? "正在检测人物…" : "识别当前画面球员"}
            </button>
            <button
              className={button}
              disabled={busy || !duration || !ready}
              onClick={() => capture(false)}
            >
              <Camera size={16} />
              截图并手动框选
            </button>
            <button
              className={button}
              disabled={busy || !duration}
              onClick={() => seek(currentTime - 1)}
            >
              −1 秒
            </button>
            <button
              className={button}
              disabled={busy || !duration}
              onClick={() => seek(currentTime + 1)}
            >
              +1 秒
            </button>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            先暂停在球员清晰的画面。系统检测人物并裁出截图；姓名、号码和是否为同一球员由你确认。可切换时间补充替补球员。
          </p>
          {frame && (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span>
                  截图时间 {timeLabel(frame.time)} ·{" "}
                  {manual ? "拖动框选球员" : "点击人物框加入名单"}
                </span>
                <button
                  className="underline"
                  disabled={busy}
                  onClick={() => setManual(!manual)}
                >
                  {manual ? "切换点选" : "漏检？手动框选"}
                </button>
              </div>
              <div
                className={`relative overflow-hidden rounded-lg select-none ${
                  manual ? "cursor-crosshair touch-none" : ""
                }`}
                style={{ aspectRatio: `${frame.width}/${frame.height}` }}
                onPointerDown={(e) => {
                  if (!manual || busy) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const p = point(e);
                  setDrag({ start: p, end: p });
                }}
                onPointerMove={(e) => {
                  if (drag) setDrag({ ...drag, end: point(e) });
                }}
                onPointerUp={finishDrag}
                onPointerCancel={() => setDrag(null)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={frame.url}
                  alt={`视频 ${timeLabel(frame.time)} 的球员截图`}
                  className="absolute inset-0 h-full w-full pointer-events-none"
                  draggable={false}
                />
                {candidates.map((c, index) => (
                  <button
                    key={c.id}
                    disabled={manual || c.added}
                    aria-label={`添加候选球员 ${index + 1}`}
                    onClick={() => addCandidate(c)}
                    className={`absolute border-2 ${
                      c.added
                        ? "border-slate-400"
                        : "border-emerald-400 hover:bg-emerald-300/20"
                    }`}
                    style={{
                      left: `${(100 * c.box[0]) / frame.width}%`,
                      top: `${(100 * c.box[1]) / frame.height}%`,
                      width: `${(100 * c.box[2]) / frame.width}%`,
                      height: `${(100 * c.box[3]) / frame.height}%`,
                      pointerEvents: manual ? "none" : "auto",
                    }}
                  >
                    <span className="absolute left-0 top-0 bg-emerald-700 px-1 text-[10px] text-white">
                      {c.added ? "已添加" : index + 1}
                    </span>
                  </button>
                ))}
                {drag && (
                  <div
                    className="absolute border-2 border-amber-400 bg-amber-300/20 pointer-events-none"
                    style={{
                      left: `${100 * Math.min(drag.start[0], drag.end[0])}%`,
                      top: `${100 * Math.min(drag.start[1], drag.end[1])}%`,
                      width: `${100 * Math.abs(drag.start[0] - drag.end[0])}%`,
                      height: `${100 * Math.abs(drag.start[1] - drag.end[1])}%`,
                    }}
                  />
                )}
              </div>
              {!!candidates.length && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {candidates.map((c, i) => (
                    <button
                      key={c.id}
                      className="w-24 shrink-0 rounded-xl border p-2 disabled:opacity-40"
                      disabled={c.added}
                      onClick={() => addCandidate(c)}
                      aria-label={`确认候选球员 ${i + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={c.photo}
                        alt={`候选人物 ${i + 1}`}
                        className="h-24 w-full rounded object-contain bg-slate-100"
                      />
                      <span className="block mt-1 text-xs">
                        {c.added ? "已加入名单" : `+ 球员 ${i + 1}`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-4 sm:p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">02 / 确认球员名单</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
              {book.players.length} 位球员
            </span>
          </div>
          {!book.players.length ? (
            <div className="rounded-xl border border-dashed py-14 px-6 text-center text-slate-500">
              <Users className="mx-auto mb-3" />
              <p className="text-sm">识别画面后，点击截图添加球员</p>
              <p className="mt-2 text-xs">每位球员都有独立档案和统计</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto">
              {book.players.map((p) => (
                <button
                  key={p.id}
                  aria-label={`选择球员 ${p.name}`}
                  onClick={() => {
                    setSelected(p.id);
                    setMergeTarget("");
                  }}
                  className={`rounded-xl border-2 p-2 text-left ${
                    selected === p.id
                      ? "border-blue-600 bg-blue-50"
                      : "border-transparent bg-slate-50"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.photo}
                    alt={p.name}
                    className="h-24 w-full rounded-lg object-contain bg-slate-200"
                  />
                  <p className="mt-2 truncate text-sm font-semibold">
                    {p.name}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {p.team}
                    {p.jersey ? ` · #${p.jersey}` : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
          {selectedPlayer && (
            <div className="space-y-3 rounded-xl bg-slate-50 p-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs space-y-1">
                  姓名 / 昵称
                  <input
                    aria-label="球员姓名"
                    maxLength={40}
                    className={input}
                    value={selectedPlayer.name}
                    onChange={(e) => updatePlayer({ name: e.target.value })}
                  />
                </label>
                <label className="text-xs space-y-1">
                  球衣号码
                  <input
                    aria-label="球衣号码"
                    maxLength={8}
                    className={input}
                    value={selectedPlayer.jersey}
                    placeholder="例如 23"
                    onChange={(e) => updatePlayer({ jersey: e.target.value })}
                  />
                </label>
              </div>
              <label className="block text-xs space-y-1">
                所属球队
                <input
                  aria-label="所属球队"
                  maxLength={40}
                  className={input}
                  value={selectedPlayer.team}
                  onChange={(e) => updatePlayer({ team: e.target.value })}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  className={button}
                  onClick={() => seek(selectedPlayer.capturedAt)}
                >
                  <Play size={14} />
                  回看截图时刻
                </button>
                <button
                  className={`${button} text-red-700`}
                  onClick={() => {
                    setBook((b) => removePlayer(b, selected));
                    setSelected("");
                    setMergeTarget("");
                    setNotice("球员已移除，关联事件已转为待分配，不会丢失。");
                  }}
                >
                  <Trash2 size={14} />
                  移除球员
                </button>
              </div>
              {book.players.length > 1 && (
                <div className="flex gap-2">
                  <select
                    aria-label="合并目标球员"
                    className={input}
                    value={mergeTarget}
                    onChange={(e) => setMergeTarget(e.target.value)}
                  >
                    <option value="">重复球员？合并到…</option>
                    {book.players
                      .filter((p) => p.id !== selected)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.team} {p.jersey}
                        </option>
                      ))}
                  </select>
                  <button
                    className={button}
                    disabled={
                      !book.players.some(
                        (p) => p.id === mergeTarget && p.id !== selected
                      )
                    }
                    onClick={() => {
                      setBook((b) => mergePlayers(b, selected, mergeTarget));
                      setSelected(mergeTarget);
                      setMergeTarget("");
                      setNotice("已合并球员，历史事件已归入保留的球员档案。");
                    }}
                  >
                    合并
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border bg-white p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="font-semibold">03 / 回看视频，按球员记分</h2>
            <p className="mt-1 text-sm text-slate-500">
              当前记到：
              <strong className="text-slate-900">
                {selectedPlayer?.name || "待分配"}
              </strong>{" "}
              · 点击下方按钮记录视频当前时间的事件
            </p>
          </div>
          <button className={button} onClick={() => setSelected("")}>
            暂不指定球员
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(EVENT_LABELS) as [EventKind, string][]).map(
            ([kind, label]) => (
              <button
                key={kind}
                disabled={!ready || !duration}
                className={
                  kind === "two" || kind === "three" ? primary : button
                }
                onClick={() => record(kind)}
              >
                <Plus size={14} />
                {label}
              </button>
            )
          )}
        </div>
        <p className="text-xs text-slate-500">
          此版本自动检测人物，比赛事件由你回看确认；不会凭截图自动判断得分或助攻。未分配或未确认的事件不会计入球员统计。
        </p>
        {notice && (
          <p
            role="status"
            className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900"
          >
            {notice}
          </p>
        )}
      </section>

      <section className="rounded-2xl border bg-white overflow-hidden">
        <div className="flex flex-wrap justify-between items-center gap-3 p-5">
          <div>
            <h2 className="font-semibold">球员数据</h2>
            <p className="mt-1 text-xs text-slate-500">
              仅统计已确认事件 · {pending} 条待处理
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className={button}
              onClick={() =>
                download(
                  `${filename}-球员统计.csv`,
                  statsCSV(book),
                  "text/csv;charset=utf-8"
                )
              }
              disabled={!ready}
            >
              <Download size={14} />
              CSV
            </button>
            <button
              className={button}
              onClick={() =>
                download(
                  `${filename}-完整记录.json`,
                  JSON.stringify({ video: filename, ...book }, null, 2),
                  "application/json"
                )
              }
              disabled={!ready}
            >
              <Download size={14} />
              JSON 备份
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {[
                  "球员",
                  "球队 / 号码",
                  "得分",
                  "助攻",
                  "篮板",
                  "进攻 / 防守篮板",
                  "抢断",
                  "盖帽",
                  "失误",
                ].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3">
                    <button
                      className="font-semibold text-blue-700"
                      onClick={() => {
                        setSelected(p.id);
                        setFilter(p.id);
                      }}
                    >
                      {p.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {p.team} / {p.jersey || "—"}
                  </td>
                  <td className="px-4 py-3 text-lg font-bold">{p.points}</td>
                  {[
                    p.assists,
                    p.rebounds,
                    `${p.offRebounds} / ${p.defRebounds}`,
                    p.steals,
                    p.blocks,
                    p.turnovers,
                  ].map((v, i) => (
                    <td key={i} className="px-4 py-3">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className="p-8 text-center text-sm text-slate-400">
              确认球员后，统计会显示在这里。
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 space-y-4">
        <div className="flex justify-between items-center gap-3">
          <h2 className="font-semibold">事件明细 · {book.events.length} 条</h2>
          <select
            aria-label="筛选事件"
            className={`${input} max-w-[220px]`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">全部事件</option>
            <option value="pending">待分配 / 待确认</option>
            {book.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="max-h-[480px] overflow-y-auto divide-y">
          {shownEvents.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap justify-between items-center gap-3 py-3 text-sm"
            >
              <div className="flex items-center gap-3">
                <button
                  className="rounded bg-slate-100 px-2 py-1 font-mono text-blue-700"
                  onClick={() => seek(e.timestamp)}
                  aria-label={`回看 ${timeLabel(e.timestamp)} ${
                    EVENT_LABELS[e.kind]
                  }`}
                >
                  {timeLabel(e.timestamp)}
                </button>
                <div>
                  <p className="font-medium">
                    {EVENT_LABELS[e.kind]} ·{" "}
                    {book.players.find((p) => p.id === e.playerId)?.name ||
                      "未分配球员"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {e.confirmed && e.playerId
                      ? "已确认"
                      : "待确认，不计入统计"}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className={button}
                  aria-label={`修改 ${EVENT_LABELS[e.kind]} 事件`}
                  onClick={() => setEditing({ ...e })}
                >
                  修改 / 归属
                </button>
                <button
                  className={`${button} text-red-700`}
                  aria-label={`删除 ${EVENT_LABELS[e.kind]} 事件`}
                  onClick={() =>
                    setBook((b) => ({
                      ...b,
                      events: b.events.filter((x) => x.id !== e.id),
                    }))
                  }
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
        {!shownEvents.length && (
          <p className="py-5 text-center text-sm text-slate-400">
            暂无事件。回看视频，在发生动作时点击记分按钮。
          </p>
        )}
      </section>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-edit-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 space-y-4"
          >
            <h2 id="event-edit-title" className="font-semibold text-lg">
              修改事件与球员归属
            </h2>
            <label className="block text-sm space-y-1">
              事件类型
              <select
                aria-label="事件类型"
                className={input}
                value={editing.kind}
                onChange={(e) =>
                  setEditing({ ...editing, kind: e.target.value as EventKind })
                }
              >
                {Object.entries(EVENT_LABELS).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm space-y-1">
              归属球员
              <select
                aria-label="事件归属球员"
                className={input}
                value={editing.playerId || ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    playerId: e.target.value || null,
                    confirmed: false,
                  })
                }
              >
                <option value="">未分配</option>
                {book.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.team} {p.jersey}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm space-y-1">
              时间（秒）
              <input
                aria-label="事件时间"
                className={input}
                type="number"
                min={0}
                max={duration}
                step={0.1}
                value={editing.timestamp}
                onChange={(e) =>
                  setEditing({ ...editing, timestamp: e.target.valueAsNumber })
                }
              />
            </label>
            <label className="block text-sm space-y-1">
              备注
              <input
                aria-label="事件备注"
                className={input}
                maxLength={200}
                value={editing.note}
                onChange={(e) =>
                  setEditing({ ...editing, note: e.target.value })
                }
              />
            </label>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.confirmed}
                disabled={!editing.playerId}
                onChange={(e) =>
                  setEditing({ ...editing, confirmed: e.target.checked })
                }
              />
              已回看确认，计入球员统计
            </label>
            <div className="flex justify-end gap-2">
              <button className={button} onClick={() => setEditing(null)}>
                取消
              </button>
              <button className={primary} onClick={saveEvent}>
                保存事件
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
