"use client";
import { SelectedHighlightExport } from "./SelectedHighlightExport";
import { uploadVideoChunks } from "@/lib/upload-client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "./AccountAccess";
import {
  defaultHighlightOptions,
  type HighlightOptions,
} from "@/lib/highlight-options";
import {
  Download,
  Film,
  Upload,
  Loader2,
  ArrowRight,
  Play,
  Volume2,
  Clock3,
  Scissors,
  FileVideo,
  CheckCircle2,
} from "lucide-react";

type Result = {
  generation?: string;
  options?: HighlightOptions;
  duration: number;
  events: { timestamp: number }[];
  clips: { start: number; end: number; baskets: number[]; file: string }[];
  clipDuration: number;
  hasHoop: boolean;
  warning: string;
};
type State = {
  options?: HighlightOptions;
  progress: {
    status: string;
    percent: number;
    message: string;
    elapsedSeconds?: number;
  } | null;
  result: Result | null;
};
const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const button = "mt-primary";

export function HighlightWorkbench() {
  const { user } = useAccount();
  const recentKey = `mt-highlights-job-${user?.id}`;
  const [options, setOptions] = useState<HighlightOptions>(
    defaultHighlightOptions
  );
  const [music, setMusic] = useState<
    { id: string; name: string; description: string; url: string }[]
  >([]);
  const [musicUploading, setMusicUploading] = useState(false);
  const musicInput = useRef<HTMLInputElement>(null);
  const hydratedOptions = useRef<string | null>(null);
  useEffect(() => {
    fetch("/api/highlight-music")
      .then((r) => r.json())
      .then(setMusic)
      .catch(() => setError("音乐库暂时无法加载，请刷新页面重试"));
  }, []);
  async function uploadMusic(file?: File) {
    if (!file) return;
    if (file.size > 30 * 1024 * 1024 || !file.size) {
      setError("请选择不超过 30 MB 的音频文件");
      return;
    }
    setMusicUploading(true);
    setError("");
    try {
      const response = await fetch("/api/highlight-music", {
        method: "POST",
        headers: {
          "x-audio-name": encodeURIComponent(file.name),
          "Content-Type": "application/octet-stream",
        },
        body: file,
      });
      const item = await response.json();
      if (!response.ok) throw new Error(item.error);
      setMusic((previous) => [
        ...previous.filter((m) => m.id !== item.id),
        item,
      ]);
      setOptions((previous) => ({ ...previous, musicId: item.id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "音乐上传失败");
    } finally {
      setMusicUploading(false);
      if (musicInput.current) musicInput.current.value = "";
    }
  }
  const [job, setJob] = useState<{ id: string; name: string } | null>(null);
  const [state, setState] = useState<State>({ progress: null, result: null });
  const [upload, setUpload] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState("highlights.mp4");
  const input = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/highlights")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRecent)
      .catch(() => {});
  }, [job]);
  function chooseExisting(id: string) {
    const selected = recent.find((v) => v.id === id);
    if (!selected) return;
    setState({ progress: null, result: null });
    setPreview("highlights.mp4");
    setJob(selected);
    window.history.replaceState(null, "", `/highlights?video=${selected.id}`);
    try {
      localStorage.setItem(recentKey, JSON.stringify(selected));
    } catch {}
    void start(selected.id);
  }
  useEffect(() => {
    try {
      const requested = new URLSearchParams(window.location.search).get(
        "video"
      );
      if (requested && /^[a-f0-9]{64}$/.test(requested)) {
        fetch("/api/highlights")
          .then((r) => r.json())
          .then((videos) => {
            const target = videos.find(
              (v: { id: string }) => v.id === requested
            );
            if (target) {
              setJob(target);
              void start(target.id);
            }
          })
          .catch(() =>
            setError("暂时无法打开这段视频，请从已上传视频中重新选择")
          );
        return;
      }
      const saved = JSON.parse(localStorage.getItem(recentKey) || "null");
      if (saved && /^[a-f0-9]{64}$/.test(saved.id)) setJob(saved);
    } catch {
      /* No saved job. */
    }
  }, [recentKey]);
  useEffect(() => {
    if (!job) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`/api/videos/${job!.id}/highlights`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "读取进度失败");
        if (!stopped) {
          setState(data);
          if (data.progress && hydratedOptions.current !== job!.id) {
            setOptions({ ...defaultHighlightOptions, ...data.options });
            hydratedOptions.current = job!.id;
          }
          setConnectionError(false);
        }
      } catch {
        if (!stopped) setConnectionError(true);
      }
      if (!stopped) timer = setTimeout(poll, 2000);
    }
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [job]);
  async function start(
    id: string,
    settings?: HighlightOptions,
    regenerate = false
  ) {
    setStarting(true);
    setError("");
    try {
      const response = await fetch(`/api/videos/${id}/highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options: settings, regenerate }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法开始剪辑");
      setState(data);
      if (hydratedOptions.current !== id) {
        setOptions({ ...defaultHighlightOptions, ...data.options });
        hydratedOptions.current = id;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法开始剪辑");
    } finally {
      setStarting(false);
    }
  }
  async function receive(file?: File) {
    if (!file) return;
    if (
      !/\.(mp4|mov|webm|mkv)$/i.test(file.name) ||
      file.size > 500 * 1024 * 1024 ||
      !file.size
    ) {
      setError("请选择不超过 500 MB 的 MP4、MOV、WebM 或 MKV 视频");
      return;
    }
    setUpload(0);
    setError("");
    setState({ progress: null, result: null });
    setJob(null);
    setPreview("highlights.mp4");
    try {
      const data = await uploadVideoChunks(file, setUpload);
      const selected = { id: data.video.id, name: data.video.name };
      setJob(selected);
      window.history.replaceState(null, "", `/highlights?video=${selected.id}`);
      try {
        localStorage.setItem(recentKey, JSON.stringify(selected));
      } catch {
        /* Storage is optional. */
      }
      await start(selected.id, options);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUpload(null);
      if (input.current) input.current.value = "";
    }
  }
  const running =
    starting || ["queued", "running"].includes(state.progress?.status || "");
  const busy = upload !== null || running || musicUploading || exporting;
  const result = state.result;
  const media = (file = "highlights.mp4", download = false) =>
    `/api/videos/${job?.id}/highlights/media?file=${encodeURIComponent(file)}${
      download ? "&download=1" : ""
    }&v=${state.result?.generation || "original"}`;
  const selectedClips =
    result?.clips.filter((c) => chosen === null || chosen.includes(c.file)) ??
    [];
  const selectedDuration = selectedClips.reduce(
    (sum, c) => sum + c.end - c.start,
    0
  );
  const done = Boolean(result?.clips.length);
  const selectedMusic = music.find((m) => m.id === options.musicId);
  const changed =
    JSON.stringify({ ...defaultHighlightOptions, ...result?.options }) !==
    JSON.stringify(options);
  useEffect(() => {
    setPreview("highlights.mp4");
    setChosen(null);
    setExporting(false);
  }, [job?.id, result?.generation]);
  return (
    <div className="mt-workspace space-y-6">
      <div className="mt-page-heading">
        <div>
          <p className="mt-eyebrow">GAME HIGHLIGHTS</p>
          <h1>进球剪辑</h1>
          <p>把进球时刻，剪成一支属于你们的精彩集锦。</p>
        </div>
        <span className="mt-pill">
          <Scissors size={13} />
          自动剪辑 · 自由配乐
        </span>
      </div>
      <div className="mt-workflow">
        <span className={upload !== null || !job ? "active" : "complete"}>
          <b>{job ? <CheckCircle2 size={15} /> : "01"}</b>上传视频
        </span>
        <ArrowRight size={15} />
        <span className={running ? "active" : done ? "complete" : ""}>
          <b>02</b>自动剪辑
        </span>
        <ArrowRight size={15} />
        <span className={done ? "active" : ""}>
          <b>03</b>预览与导出
        </span>
        <small>从整场比赛，到专属高光</small>
      </div>
      {error && (
        <p role="alert" className="mt-error">
          {error}
        </p>
      )}
      {connectionError && (
        <p role="status" className="mt-error">
          暂时无法连接本地服务，正在自动重连。已启动的任务会在后台继续运行。
        </p>
      )}
      <div className="mt-editing-layout">
        <div className="space-y-5">
          <section className="mt-panel p-5">
            <div className="mt-card-heading">
              <h2>视频素材</h2>
              <span>01 / SOURCE</span>
            </div>
            <div
              className={`mt-dropzone ${dragging ? "is-dragging" : ""} ${
                busy ? "is-busy" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!busy) void receive(e.dataTransfer.files?.[0]);
              }}
            >
              <div className="mt-upload-icon">
                {busy ? (
                  <Loader2 size={25} className="animate-spin" />
                ) : (
                  <Upload size={25} strokeWidth={1.5} />
                )}
              </div>
              <h3>
                {upload !== null
                  ? `正在上传 ${upload}%`
                  : running
                  ? "正在制作进球集锦"
                  : "把比赛视频拖到这里"}
              </h3>
              <p>
                {busy ? "请保持本地服务运行" : "或从电脑中选择一个视频文件"}
              </p>
              <input
                ref={input}
                type="file"
                accept=".mp4,.mov,.webm,.mkv"
                className="sr-only"
                aria-label="选择比赛视频"
                disabled={busy}
                onChange={(e) => void receive(e.target.files?.[0])}
              />
              <button
                className={button}
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                {busy ? "正在处理中…" : job ? "上传新视频" : "上传并自动剪辑"}
                {!busy && <ArrowRight size={16} />}
              </button>
              <small>
                MP4 / MOV / WebM / MKV
                <br />
                最大 500 MB · 最长 120 分钟
              </small>
            </div>
            {recent.length > 0 && (
              <div className="mt-existing">
                <label htmlFor="recent-video">从已上传的视频中选择</label>
                <select
                  id="recent-video"
                  value={job?.id || ""}
                  disabled={busy}
                  onChange={(e) => chooseExisting(e.target.value)}
                >
                  <option value="" disabled>
                    选择视频，自动开始剪辑
                  </option>
                  {recent.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>
          <section className="mt-panel p-5">
            <div className="mt-card-heading">
              <h2>剪辑方式</h2>
              <span>自定义配置</span>
            </div>
            <fieldset disabled={busy} className="mt-edit-options">
              <div className="mt-duration-inputs">
                <label>
                  进球前保留
                  <input
                    aria-label="进球前保留秒数"
                    type="number"
                    min={1}
                    max={15}
                    step={1}
                    value={options.before}
                    onChange={(e) =>
                      setOptions({ ...options, before: Number(e.target.value) })
                    }
                  />
                  <small>1–15 秒</small>
                </label>
                <label>
                  进球后保留
                  <input
                    aria-label="进球后保留秒数"
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    value={options.after}
                    onChange={(e) =>
                      setOptions({ ...options, after: Number(e.target.value) })
                    }
                  />
                  <small>1–10 秒</small>
                </label>
              </div>
              <label className="mt-option-check">
                <input
                  type="checkbox"
                  checked={options.mergeOverlaps}
                  onChange={(e) =>
                    setOptions({ ...options, mergeOverlaps: e.target.checked })
                  }
                />
                <span>
                  合并时间重叠的片段
                  <small>关闭后，每个进球独立保留一个片段。</small>
                </span>
              </label>
              <div className="mt-option-slider">
                <label htmlFor="original-volume">
                  现场原声音量{" "}
                  <span>{Math.round(options.originalVolume * 100)}%</span>
                </label>
                <input
                  id="original-volume"
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(options.originalVolume * 100)}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      originalVolume: Number(e.target.value) / 100,
                    })
                  }
                />
                <small>设为 0% 可关闭现场原声。</small>
              </div>
            </fieldset>
          </section>
          <section className="mt-panel p-5">
            <div className="mt-card-heading">
              <h2>背景音乐</h2>
              <span>为精彩加点节奏</span>
            </div>
            <fieldset disabled={busy} className="mt-edit-options">
              <label className="mt-music-select">
                选择音乐
                <select
                  aria-label="背景音乐"
                  value={options.musicId}
                  onChange={(e) =>
                    setOptions({ ...options, musicId: e.target.value })
                  }
                >
                  <option value="none">不添加背景音乐</option>
                  {music.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedMusic && (
                <div className="mt-music-preview">
                  <p>{selectedMusic.description}</p>
                  <audio
                    key={selectedMusic.url}
                    controls
                    preload="none"
                    src={selectedMusic.url}
                    aria-label="背景音乐试听"
                  />
                  <small>试听原曲；导出时按下方音量混合。</small>
                </div>
              )}
              <input
                ref={musicInput}
                className="sr-only"
                type="file"
                accept=".mp3,.m4a,.wav,.aac,.ogg,.flac"
                aria-label="选择自定义背景音乐"
                onChange={(e) => void uploadMusic(e.target.files?.[0])}
              />
              <button
                className="mt-music-upload"
                disabled={busy}
                onClick={() => musicInput.current?.click()}
              >
                <Upload size={15} />
                {musicUploading ? "正在处理音乐…" : "上传自定义音乐"}
              </button>
              <p className="mt-music-note">
                MP3 / M4A / WAV / AAC / OGG / FLAC · 最大 30 MB，最多保留前 10
                分钟。
              </p>
              <div className="mt-option-slider">
                <label htmlFor="music-volume">
                  背景音乐音量{" "}
                  <span>{Math.round(options.musicVolume * 100)}%</span>
                </label>
                <input
                  disabled={options.musicId === "none" || busy}
                  id="music-volume"
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(options.musicVolume * 100)}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      musicVolume: Number(e.target.value) / 100,
                    })
                  }
                />
              </div>
            </fieldset>
            <p className="mt-music-note">
              音乐自动循环至集锦结束，并淡入淡出。完整集锦配乐连续；单独片段从音乐开头配乐。
            </p>
          </section>
          <div className="mt-panel p-5">
            <button
              className={`${button} w-full`}
              disabled={
                busy ||
                !job ||
                options.before < 1 ||
                options.before > 15 ||
                options.after < 1 ||
                options.after > 10
              }
              onClick={() => job && void start(job.id, options, true)}
            >
              {running ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Scissors size={16} />
              )}
              {running
                ? "正在生成…"
                : result
                ? "应用配置，重新生成集锦"
                : "按当前配置生成集锦"}
            </button>
            <p className="mt-music-note">
              {!job
                ? "先设置剪辑与配乐，再上传比赛视频。"
                : changed && result
                ? "配置尚未应用，当前预览和下载仍为上一版。"
                : "已识别的进球会直接复用，无需重新分析整段视频。"}
            </p>
          </div>
          <div className="mt-hint">
            <strong>让画面更容易被识别</strong>
            <p>
              固定机位，尽量完整拍到篮筐。当前可能漏剪或误剪，热身及死球投篮还不能可靠排除。
            </p>
          </div>
        </div>
        <div className="min-w-0 space-y-5">
          <section className="mt-panel overflow-hidden">
            <div className="mt-panel-heading">
              <div>
                <h2>集锦预览</h2>
                <p className="max-w-sm truncate" title={job?.name}>
                  {job?.name || "你的精彩，即将在这里呈现"}
                </p>
              </div>
              <span className={`mt-status ${done ? "is-ready" : ""}`}>
                {running
                  ? done
                    ? "制作中 · 预览为上一版"
                    : "制作中"
                  : done
                  ? "已完成"
                  : "等待素材"}
              </span>
            </div>
            {result && changed && !running && (
              <div className="mt-config-pending">
                <p>配置已修改，当前预览与下载仍为上一版。</p>
                <button
                  disabled={
                    busy ||
                    options.before < 1 ||
                    options.before > 15 ||
                    options.after < 1 ||
                    options.after > 10
                  }
                  onClick={() => job && void start(job.id, options, true)}
                >
                  应用并重新生成 <ArrowRight size={14} />
                </button>
              </div>
            )}
            {done ? (
              <video
                key={media(preview)}
                src={media(preview)}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full bg-black"
              />
            ) : (
              <div className="mt-preview-empty">
                <div className="mt-preview-grid" />
                <div className="mt-preview-symbol">
                  {running ? (
                    <Loader2 size={32} className="animate-spin" />
                  ) : (
                    <Play size={30} strokeWidth={1.3} />
                  )}
                </div>
                <h3>
                  {running
                    ? "正在寻找场上的精彩瞬间"
                    : result
                    ? "暂未生成进球片段"
                    : "每个精彩进球，都值得再看一次"}
                </h3>
                <p>
                  {running
                    ? state.progress?.message || "正在准备自动剪辑"
                    : result
                    ? result.hasHoop
                      ? "未检测到满足条件的进球，这不代表视频中没有进球。"
                      : "未识别到可用篮筐，请尝试篮筐更清晰的视频。"
                    : "上传视频后，集锦将自动生成。"}
                </p>
                <div className="mt-preview-tags">
                  <span>自动检测</span>
                  <i />
                  <span>精彩成片</span>
                  <i />
                  <span>一键导出</span>
                </div>
              </div>
            )}
            {(running || upload !== null) && (
              <div className="p-5">
                <div className="mb-3 flex justify-between text-xs text-slate-500">
                  <span role="status">
                    {upload !== null && upload < 100
                      ? "正在上传视频"
                      : state.progress?.message || "正在准备分析"}
                  </span>
                  <strong>
                    {Math.floor(
                      upload !== null && upload < 100
                        ? upload
                        : state.progress?.percent || 0
                    )}
                    %
                  </strong>
                </div>
                <progress
                  aria-label="剪辑进度"
                  value={
                    upload !== null && upload < 100
                      ? upload
                      : state.progress?.percent || 0
                  }
                  max={100}
                  className="h-1.5 w-full accent-orange-600"
                />
                <p className="mt-3 text-xs leading-5 text-slate-400">
                  分析耗时取决于视频长度与电脑性能。任务启动后可以离开页面，稍后回来查看。
                </p>
              </div>
            )}
            {job &&
              !running &&
              (!state.progress ||
                ["failed", "cancelled"].includes(state.progress.status)) && (
                <div className="p-5">
                  <p role="status" className="mb-3 text-sm text-slate-500">
                    {state.progress?.message ||
                      "素材已就绪，开始制作你的进球集锦。"}
                  </p>
                  <button className={button} onClick={() => void start(job.id)}>
                    开始 / 重试剪辑 <ArrowRight size={16} />
                  </button>
                </div>
              )}
            {done && (
              <div className="mt-export-bar">
                <div>
                  <strong>
                    {preview === "highlights.mp4"
                      ? "完整进球集锦"
                      : `片段 ${Number(preview.match(/\d+/)?.[0])}`}
                  </strong>
                  <p>
                    {result!.clips.length} 个片段 · 总时长{" "}
                    {clock(result!.clipDuration)} · MP4
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-3">
                  <SelectedHighlightExport
                    key={`${job?.id}:${result?.generation}`}
                    id={job!.id}
                    generation={result?.generation || "original"}
                    files={selectedClips.map((c) => c.file)}
                    onBusy={setExporting}
                  />
                  <a
                    className="mt-text-link"
                    href={media("highlights.mp4", true)}
                  >
                    <Download size={17} />
                    下载全部片段集锦
                  </a>
                </div>
              </div>
            )}
          </section>
          <section className="mt-panel">
            <div className="mt-panel-heading">
              <div>
                <h2>
                  进球片段{" "}
                  <span className="mt-count">{result?.clips.length || 0}</span>
                </h2>
                <p>勾选需要保留的片段，按比赛时间合成；也可单独播放和下载。</p>
              </div>
              {done && preview !== "highlights.mp4" && (
                <button
                  className="mt-text-link"
                  onClick={() => setPreview("highlights.mp4")}
                >
                  播放完整集锦
                </button>
              )}
            </div>
            {done ? (
              <div>
                <div className="px-5 py-3 flex flex-wrap items-center gap-4 border-b border-slate-100">
                  <button
                    className="mt-text-link"
                    disabled={exporting}
                    onClick={() => setChosen(null)}
                  >
                    全选
                  </button>
                  <button
                    className="mt-text-link"
                    disabled={exporting}
                    onClick={() => setChosen([])}
                  >
                    取消全选
                  </button>
                  <span className="text-sm text-slate-500">
                    已选 {selectedClips.length} / {result!.clips.length} 段 · 约{" "}
                    {clock(selectedDuration)}
                  </span>
                  {!selectedClips.length && (
                    <span className="text-sm text-orange-600">
                      请至少选择一个片段
                    </span>
                  )}
                </div>
                <div className="mt-clip-list">
                  {result!.clips.map((clip, i) => (
                    <div
                      key={clip.file}
                      className={`mt-clip-row ${
                        preview === clip.file ? "active" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-orange-500"
                        aria-label={`选择片段 ${i + 1}`}
                        disabled={exporting}
                        checked={chosen === null || chosen.includes(clip.file)}
                        onChange={(e) =>
                          setChosen(
                            e.target.checked
                              ? [...selectedClips.map((c) => c.file), clip.file]
                              : selectedClips
                                  .filter((c) => c.file !== clip.file)
                                  .map((c) => c.file)
                          )
                        }
                      />
                      <button
                        className="mt-clip-play"
                        aria-label={`播放片段 ${i + 1}`}
                        onClick={() => setPreview(clip.file)}
                      >
                        <Play size={17} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <strong>
                          进球片段 {String(i + 1).padStart(2, "0")}
                        </strong>
                        <p>
                          原视频 {clock(clip.start)} — {clock(clip.end)}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">
                        {Math.round(clip.end - clip.start)} 秒
                      </span>
                      <a
                        href={media(clip.file, true)}
                        className="mt-icon-button"
                        aria-label={`下载片段 ${i + 1}`}
                      >
                        <Download size={17} />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-empty mt-empty-small">
                <Film size={27} />
                <p>剪辑完成后，所有进球片段将在这里展示。</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
