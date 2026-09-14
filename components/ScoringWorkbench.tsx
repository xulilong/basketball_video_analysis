"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Upload,
  Users,
  Play,
  Loader2,
  ArrowRight,
  BarChart3,
  Film,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type {
  PersonStats,
  VideoJob,
  WorkbenchView,
} from "@/lib/workbench-types";

const formatTime = (n: number) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;
const statusName = {
  uploaded: "待分析",
  queued: "排队中",
  running: "分析中",
  complete: "已完成",
  failed: "分析失败",
  cancelled: "已停止",
};
const points = (
  p: Pick<PersonStats, "made" | "knownPoints" | "unknownValue">
) =>
  p.unknownValue
    ? p.knownPoints
      ? `${p.knownPoints} 分 · ${p.unknownValue} 球待判分`
      : `${p.unknownValue} 球待判分`
    : p.made
    ? String(p.knownPoints)
    : "—";

export function ScoringWorkbench() {
  const [data, setData] = useState<WorkbenchView | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"video" | "total">("video");
  const [search, setSearch] = useState("");
  const [onlyScorers, setOnlyScorers] = useState(false);
  const [identitiesOpen, setIdentitiesOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [upload, setUpload] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{
    id: string;
    name: string;
    target: string;
  } | null>(null);
  const editorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!editor?.id) return;
    const previous = document.activeElement as HTMLElement | null;
    editorRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setEditor(null);
      if (event.key !== "Tab") return;
      const elements = Array.from(
        editorRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled])"
        ) || []
      );
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, [editor?.id]);
  const input = useRef<HTMLInputElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const uploadRequest = useRef<XMLHttpRequest | null>(null);
  const refreshNumber = useRef(0);

  async function refresh() {
    const number = ++refreshNumber.current;
    const response = await fetch("/api/workbench", { cache: "no-store" });
    const next = await response.json();
    if (!response.ok) throw new Error(next.error);
    if (number === refreshNumber.current) {
      setData(next);
      setSelected((current) => current ?? next.videos[0]?.id ?? null);
    }
    return next as WorkbenchView;
  }
  useEffect(() => {
    const refreshSequence = refreshNumber;
    let live = true;
    const load = () =>
      refresh().catch((e) => {
        if (live) setError(e.message);
      });
    const requested = new URLSearchParams(window.location.search).get("video");
    if (requested && /^[a-f0-9]{64}$/.test(requested)) setSelected(requested);
    void load();
    const timer = setInterval(load, 3000);
    return () => {
      live = false;
      clearInterval(timer);
      refreshSequence.current++;
      uploadRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    setPage(1);
  }, [search, onlyScorers, selected, tab]);
  const video = data?.videos.find((v) => v.id === selected) ?? null;
  const progress = selected ? data?.progress[selected] : undefined;
  const active = video && ["queued", "running"].includes(video.status);
  const result = video?.result;

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function uploadFile(file?: File) {
    if (!file) return;
    setError("");
    setNotice("");
    if (!/\.(mp4|mov|webm|mkv)$/i.test(file.name)) {
      setError("请选择 MP4、MOV、WebM 或 MKV 视频");
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      setError("视频不能超过 500 MB");
      return;
    }
    setUpload(0);
    try {
      const response = await new Promise<{
        video: VideoJob;
        duplicate: boolean;
      }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        uploadRequest.current = xhr;
        xhr.open("POST", "/api/videos");
        xhr.setRequestHeader("X-Video-Name", encodeURIComponent(file.name));
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setUpload(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          try {
            const r = JSON.parse(xhr.responseText);
            if (xhr.status >= 400) reject(new Error(r.error));
            else resolve(r);
          } catch {
            reject(new Error("上传失败，请重试"));
          }
        };
        xhr.onerror = () =>
          reject(new Error("无法连接本地服务，请检查服务是否运行"));
        xhr.onabort = () => reject(new Error("已取消上传"));
        xhr.send(file);
      });
      await refresh();
      setSelected(response.video.id);
      setTab("video");
      setNotice(
        response.duplicate
          ? "这个文件已有记录，已打开原记录，不会重复累计得分。"
          : "视频已上传到本机，点击“开始分析”生成球员和个人得分。"
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUpload(null);
      uploadRequest.current = null;
      if (input.current) input.current.value = "";
    }
  }

  let rows: PersonStats[] = data?.players ?? [];
  if (tab === "video") {
    rows =
      result && video
        ? (data?.players ?? [])
            .filter((p) => Object.values(video.associations).includes(p.id))
            .map((p) => {
              const events = result.events.filter(
                (e) =>
                  e.status === "estimated" &&
                  e.playerId &&
                  video.associations[e.playerId] === p.id
              );
              const knownPoints = events.reduce(
                  (n, e) => n + (e.points ?? 0),
                  0
                ),
                unknownValue = events.filter((e) => e.points === null).length;
              return {
                ...p,
                made: events.length,
                knownPoints,
                unknownValue,
                pointsMin: knownPoints,
                pointsMax: knownPoints,
              };
            })
            .sort(
              (a, b) =>
                b.knownPoints - a.knownPoints ||
                b.made - a.made ||
                a.name.localeCompare(b.name, "zh-CN", { numeric: true })
            )
        : [];
  }
  const totalMade = rows.reduce((n, p) => n + p.made, 0);
  const knownPoints = rows.reduce((n, p) => n + p.knownPoints, 0);
  const completeCount =
    data?.videos.filter((v) => v.status === "complete").length ?? 0;
  const pendingValues = rows.reduce((n, p) => n + p.unknownValue, 0);
  const nameFor = (id: string | null) =>
    id && video
      ? data?.players.find((p) => p.id === video.associations[id])?.name ??
        "归属未定"
      : "归属未定";

  const filteredRows = rows.filter(
    (p) =>
      `${p.name} ${p.jerseyNumber ?? ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()) &&
      (!onlyScorers || p.made > 0)
  );
  const pages = Math.max(1, Math.ceil(filteredRows.length / 12));
  const currentPage = Math.min(page, pages);
  const visibleRows = filteredRows.slice(
    (currentPage - 1) * 12,
    currentPage * 12
  );
  return (
    <div className="mt-workspace mt-statistics">
      <div className="space-y-6">
        <div className="mt-page-heading">
          <div>
            <p className="mt-eyebrow">PLAYER ANALYTICS</p>
            <h1>技术统计</h1>
            <p>记录每个人的表现，让每一次投入都有迹可循。</p>
          </div>
          <span className="mt-pill">数据分析 · 实验版</span>
        </div>
        <div className="mt-workflow">
          <span className="active">
            <b>01</b>上传视频
          </span>
          <ArrowRight size={15} />
          <span className={active ? "active" : ""}>
            <b>02</b>开始分析
          </span>
          <ArrowRight size={15} />
          <span className={result ? "active" : ""}>
            <b>03</b>查看个人数据
          </span>
          <small>同一球员，多段视频持续累计</small>
        </div>
        <section
          className={`mt-upload-strip ${dragging ? "is-dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (upload === null) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (upload === null) void uploadFile(e.dataTransfer.files?.[0]);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Upload className="text-orange-500" />
              <div>
                <h3 className="font-semibold">上传视频，开启本场分析</h3>
                <p className="mt-1 text-xs text-slate-500">
                  拖拽视频到这里，或点击上传 · MP4 / MOV / WebM / MKV · 最大 500
                  MB
                </p>
              </div>
            </div>
            <input
              ref={input}
              type="file"
              accept="video/*,.mkv"
              className="sr-only"
              aria-label="上传技术统计视频"
              onChange={(e) => void uploadFile(e.target.files?.[0])}
            />
            <button
              disabled={upload !== null}
              onClick={() => input.current?.click()}
              className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {upload !== null ? `正在上传 ${upload}%` : "上传视频"}
            </button>
          </div>
          {upload !== null && (
            <div className="mt-4">
              <progress
                className="h-2 w-full accent-orange-500"
                value={upload}
                max={100}
              />
              <p className="mt-2 text-xs text-slate-500">
                {upload === 100 ? "正在校验文件并保存…" : "正在传到本机服务…"}
              </p>
            </div>
          )}
        </section>
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800"
          >
            {notice}
          </p>
        )}
        <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <button
              onClick={() => setTab("total")}
              className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left ${
                tab === "total" ? "border-orange-300 bg-orange-50" : "bg-white"
              }`}
            >
              <BarChart3 size={20} />
              <div>
                <strong className="text-sm">累计球员数据</strong>
                <p className="mt-1 text-xs text-slate-500">
                  {data?.players.length ?? 0} 份球员档案 · {completeCount}{" "}
                  个已分析视频
                </p>
              </div>
            </button>
            <div className="rounded-xl border bg-white">
              <h3 className="border-b px-4 py-3 text-sm font-semibold">
                视频记录
              </h3>
              <div className="max-h-[600px] overflow-y-auto">
                {!data ? (
                  <p className="p-4 text-sm text-slate-500">正在读取记录…</p>
                ) : !data.videos.length ? (
                  <p className="p-4 text-sm text-slate-500">
                    上传后会出现在这里
                  </p>
                ) : (
                  data.videos.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setSelected(v.id);
                        setTab("video");
                        setNotice("");
                      }}
                      className={`block w-full border-b p-4 text-left last:border-b-0 ${
                        selected === v.id && tab === "video"
                          ? "bg-orange-50"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <p
                        className="truncate text-sm font-medium"
                        title={v.name}
                      >
                        {v.name}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        {statusName[v.status]} ·{" "}
                        {new Date(v.createdAt).toLocaleDateString("zh-CN")}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </aside>
          <div className="min-w-0 space-y-5">
            {tab === "video" && !video && (
              <section className="rounded-2xl border bg-white px-6 py-16 text-center">
                <Film className="mx-auto mb-4 text-slate-300" size={36} />
                <h3 className="font-semibold">选择视频后开始分析</h3>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
                  系统会分析实际上传的画面，生成人物截图与得分估算。没有识别到的内容会留空。
                </p>
              </section>
            )}
            {tab === "video" && video && (
              <section className="rounded-xl border bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-all font-semibold">{video.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {statusName[video.status]}
                      {result
                        ? ` · 已分析 ${formatTime(
                            result.analyzedSeconds
                          )} · 用时 ${formatTime(result.elapsedSeconds)}`
                        : ""}
                    </p>
                  </div>
                  {!["complete", "running", "queued"].includes(
                    video.status
                  ) && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send(`/api/videos/${video.id}/analyze`, "POST")
                      }
                      className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                      <Play size={16} />
                      {video.status === "uploaded"
                        ? "开始分析"
                        : "重新开始分析"}
                    </button>
                  )}
                  {active && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send(`/api/videos/${video.id}/analyze`, "DELETE")
                      }
                      className="rounded-lg border px-3 py-2 text-sm"
                    >
                      停止分析
                    </button>
                  )}
                  {video.status === "complete" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send(`/api/videos/${video.id}/analyze`, "POST", {
                          force: true,
                        })
                      }
                      className="rounded-lg border border-orange-300 px-3 py-2 text-sm text-orange-700"
                    >
                      使用新版重新分析
                    </button>
                  )}
                </div>
                {active && (
                  <div className="mt-5 space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2
                        size={16}
                        className="animate-spin text-orange-500"
                      />
                      {progress?.message ?? "正在启动本地分析任务…"}
                    </div>
                    <progress
                      className="h-2 w-full accent-orange-500"
                      value={progress?.percent ?? 0}
                      max={100}
                    />
                    <p className="text-xs text-slate-500">
                      {progress?.percent ?? 0}%
                      {progress?.processedSeconds != null
                        ? ` · 已扫描 ${formatTime(progress.processedSeconds)}`
                        : ""}
                      {progress?.elapsedSeconds != null
                        ? ` · 已用时 ${formatTime(progress.elapsedSeconds)}`
                        : ""}{" "}
                      · 可以离开页面，任务会在本机继续运行
                    </p>
                  </div>
                )}
                {video.error && (
                  <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                    {video.error}
                  </p>
                )}
                {video.status === "uploaded" && (
                  <p className="mt-4 text-sm leading-6 text-slate-500">
                    首次加载模型需要一些时间。分析完成后会自动保存结果并计入累计，同一个文件不会重复加分。
                  </p>
                )}
              </section>
            )}
            {tab === "video" && video?.court && (
              <details className="rounded-xl border bg-white p-5">
                <summary className="cursor-pointer font-semibold">
                  球场标线参考 · 查看三分线识别
                </summary>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  黄色线标记三分线在画面右侧的可见弧段。由多个时刻的画面消除人物遮挡后，辅助识别实际地面标线。
                </p>
                <Image
                  unoptimized
                  src={`/api/videos/${video.id}/court`}
                  alt="本视频右侧三分线的可见弧段，黄色标记；画外部分未补画"
                  width={1280}
                  height={720}
                  className="mt-4 h-auto w-full rounded-lg"
                />
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  {video.court.note}
                </p>
              </details>
            )}
            {(tab === "total" || result) && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-bold">
                    {tab === "total" ? "球员累计表现" : "本视频个人得分"}
                  </h3>
                  <button
                    className="text-sm text-orange-700 underline"
                    onClick={() => {
                      const blob = new Blob(
                        [
                          JSON.stringify(
                            {
                              scope: tab,
                              video: tab === "video" ? video?.name : undefined,
                              players: rows,
                            },
                            null,
                            2
                          ),
                        ],
                        { type: "application/json" }
                      );
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download =
                        tab === "video"
                          ? "本视频个人得分.json"
                          : "球员累计得分.json";
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    导出数据
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["人物记录（可能重复）", `${rows.length} 条`],
                    ["计入进球", `${totalMade} 球`],
                    [
                      "已判定得分",
                      pendingValues
                        ? knownPoints
                          ? `${knownPoints} 分 · ${pendingValues} 球待判分`
                          : `${pendingValues} 球待判分`
                        : totalMade
                        ? `${knownPoints} 分`
                        : "—",
                    ],
                  ].map(([title, value]) => (
                    <div key={title} className="rounded-xl border bg-white p-4">
                      <p className="text-xs text-slate-500">{title}</p>
                      <p className="mt-2 text-xl font-bold">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  当前为实验版，人物和进球仍可能识别错误。无法区分两分或三分的进球单列为“待判分”，不加入得分累计。“—”不代表实际零分。旧视频可使用新版重新分析，成功后替换旧结果，不重复累计。
                </p>
                {tab === "video" && result?.identityMerge && (
                  <p className="text-sm text-slate-600">
                    已完成全视频相似度合并：{result.identityMerge.before}{" "}
                    条初始人物记录 → {result.identityMerge.after} 条，自动合并{" "}
                    {result.identityMerge.merged} 条重复记录。
                  </p>
                )}
                <div className="mt-table-tools">
                  <label className="mt-search">
                    <Search size={17} />
                    <input
                      aria-label="搜索球员姓名"
                      placeholder="搜索球员姓名…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={onlyScorers}
                      onChange={(e) => setOnlyScorers(e.target.checked)}
                      className="accent-orange-600"
                    />
                    仅显示有进球记录的球员
                  </label>
                </div>
                <div className="overflow-x-auto rounded-xl border bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        {[
                          "球员",
                          "计入进球",
                          "个人得分",
                          tab === "video" ? "历史累计" : "视频数",
                          "管理",
                        ].map((s) => (
                          <th key={s} className="whitespace-nowrap p-4">
                            {s}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((p) => (
                        <tr key={p.id} className="border-t">
                          <td className="p-4">
                            <div className="flex min-w-40 items-center gap-3">
                              <Image
                                unoptimized
                                src={p.photo}
                                alt={p.name}
                                width={48}
                                height={76}
                                className="h-20 w-12 rounded-lg bg-slate-50 object-contain"
                              />
                              <div>
                                <strong>{p.name}</strong>
                                {p.jerseyNumber && (
                                  <p className="mt-1 text-xs text-slate-400">
                                    #{p.jerseyNumber}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-4">{p.made}</td>
                          <td className="p-4 text-xl font-bold text-orange-700">
                            {points(p)}
                          </td>
                          <td className="p-4">
                            {tab === "video"
                              ? points(
                                  data!.players.find((v) => v.id === p.id)!
                                )
                              : p.videos}
                          </td>
                          <td className="p-4">
                            <button
                              className="whitespace-nowrap text-blue-700 underline"
                              onClick={() =>
                                setEditor({
                                  id: p.id,
                                  name: p.name,
                                  target: "",
                                })
                              }
                            >
                              管理档案
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!filteredRows.length && (
                        <tr>
                          <td
                            colSpan={5}
                            className="p-8 text-center text-slate-500"
                          >
                            {search || onlyScorers
                              ? "没有符合条件的球员，试试其他姓名或取消筛选。"
                              : tab === "total"
                              ? "分析完成后，这里会累积每位球员的数据。"
                              : "未检测到足够清晰的人物，请查看下方分析说明。"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-pagination">
                  <span>
                    共 {filteredRows.length} 条记录 · 第 {currentPage} / {pages}{" "}
                    页
                  </span>
                  <div>
                    <button
                      aria-label="上一页球员"
                      disabled={currentPage === 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      aria-label="下一页球员"
                      disabled={currentPage === pages}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
                {tab === "total" && (
                  <p className="text-xs leading-6 text-slate-500">
                    姓名和累计记录保存在本机服务中，刷新页面不会丢失。相同文件按内容去重；不同剪辑若包含同一段比赛，目前无法自动排除重复片段。
                  </p>
                )}
              </>
            )}
            {tab === "video" && result && video && (
              <>
                <details
                  className="rounded-xl border bg-white p-4"
                  onToggle={(e) => setIdentitiesOpen(e.currentTarget.open)}
                >
                  <summary className="cursor-pointer font-medium">
                    调整人物关联 · 自动匹配不准时使用
                  </summary>
                  <p className="my-3 text-sm leading-6 text-slate-500">
                    同一天、相同衣着会尝试自动关联；换衣服或外观相似时，请关联到已有球员。只需调整身份，历史得分会自动重新汇总。
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {identitiesOpen &&
                      result.players.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 rounded-lg border p-3"
                        >
                          <Image
                            unoptimized
                            src={p.photo}
                            alt={`本视频人物 ${p.id}`}
                            width={40}
                            height={64}
                            className="h-16 w-10 object-contain"
                          />
                          <div className="min-w-0 flex-1">
                            <label
                              className="text-xs text-slate-500"
                              htmlFor={`link-${p.id}`}
                            >
                              {video.autoMatched.includes(p.id)
                                ? "已按外观自动关联 · 可修正"
                                : "本视频识别的人物"}
                            </label>
                            <select
                              id={`link-${p.id}`}
                              disabled={busy}
                              value={video.associations[p.id]}
                              onChange={(e) =>
                                void send("/api/workbench", "PATCH", {
                                  type: "link",
                                  videoId: video.id,
                                  localId: p.id,
                                  target: e.target.value,
                                })
                              }
                              className="mt-1 w-full rounded border bg-white p-2 text-sm"
                            >
                              {data?.players
                                .filter((v) => !v.archived)
                                .sort(
                                  (a, b) =>
                                    Number(Boolean(b.roster)) -
                                    Number(Boolean(a.roster))
                                )
                                .map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name}
                                  </option>
                                ))}
                              <option value="new">
                                不是同一人，建立新球员
                              </option>
                            </select>
                          </div>
                        </div>
                      ))}
                  </div>
                </details>
                <details className="rounded-xl border bg-white p-4">
                  <summary className="cursor-pointer font-medium">
                    分析说明与事件依据
                  </summary>
                  <ul className="my-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
                    {result.warnings.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                  <video
                    key={video.id}
                    ref={player}
                    src={`/api/videos/${video.id}/media`}
                    controls
                    preload="none"
                    className="mb-4 max-h-96 w-full rounded-lg bg-black"
                  />
                  <p className="mb-3 text-sm text-slate-500">
                    {result.events.length} 个带轨迹依据的候选 ·{" "}
                    {
                      result.events.filter((e) => e.status === "unresolved")
                        .length
                    }{" "}
                    个归属未定 ·{" "}
                    {
                      result.events.filter((e) => e.status === "excluded")
                        .length
                    }{" "}
                    个疑似非比赛排除
                  </p>
                  {result.events.map((e) => (
                    <div
                      key={e.id}
                      className="flex flex-wrap gap-3 border-t py-3 text-sm"
                    >
                      <button
                        className="text-blue-700 underline"
                        onClick={() => {
                          if (player.current) {
                            player.current.currentTime = Math.max(
                              0,
                              (e.releaseTime ?? e.timestamp) - 2
                            );
                            void player.current.play().catch(() => {});
                          }
                        }}
                      >
                        {formatTime(e.timestamp)}
                      </button>
                      <strong>{nameFor(e.playerId)}</strong>
                      <span>
                        {e.status === "estimated"
                          ? e.points === null
                            ? "进球已关联 · 分值待确认"
                            : `计入 ${e.points} 分`
                          : e.status === "excluded"
                          ? "自动排除"
                          : "未计入"}
                      </span>
                      <span className="text-xs text-slate-500">{e.reason}</span>
                    </div>
                  ))}
                </details>
              </>
            )}
          </div>
        </div>
      </div>
      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <section
            ref={editorRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-editor-title"
            className="w-full max-w-md space-y-5 rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 id="player-editor-title" className="text-lg font-bold">
              管理球员档案
            </h2>
            {error && (
              <p role="alert" className="mt-error">
                {error}
              </p>
            )}
            <label className="block text-sm">
              球员姓名
              <input
                value={editor.name}
                maxLength={60}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                className="mt-2 w-full rounded-lg border p-3"
              />
            </label>
            <button
              disabled={busy || !editor.name.trim()}
              onClick={async () => {
                if (
                  await send("/api/workbench", "PATCH", {
                    type: "rename",
                    id: editor.id,
                    name: editor.name,
                  })
                )
                  setEditor(null);
              }}
              className="w-full rounded-lg bg-orange-600 py-2 text-white disabled:opacity-50"
            >
              保存姓名
            </button>
            <div className="border-t pt-4">
              <label className="block text-sm">
                与已有球员合并
                <select
                  value={editor.target}
                  onChange={(e) =>
                    setEditor({ ...editor, target: e.target.value })
                  }
                  className="mt-2 w-full rounded-lg border bg-white p-3"
                >
                  <option value="">选择同一位球员的档案</option>
                  {data?.players
                    .filter((p) => p.id !== editor.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <p className="my-2 text-xs leading-5 text-slate-500">
                合并后使用目标档案的姓名，所有视频中的记录会重新汇总。仅在两张截图确为同一人时使用。
              </p>
              <button
                disabled={busy || !editor.target}
                onClick={async () => {
                  if (
                    await send("/api/workbench", "PATCH", {
                      type: "merge",
                      source: editor.id,
                      target: editor.target,
                    })
                  )
                    setEditor(null);
                }}
                className="w-full rounded-lg border py-2 text-sm disabled:opacity-40"
              >
                合并档案与历史得分
              </button>
            </div>
            <button
              disabled={busy}
              onClick={() => setEditor(null)}
              className="w-full text-sm text-slate-500"
            >
              关闭
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
