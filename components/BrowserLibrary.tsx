"use client";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "./AccountAccess";
import {
  archiveStore,
  saveArchive,
  cleanupArchive,
  downloadBlob,
  type LocalArchive,
} from "@/lib/browser-library";
import { uploadVideoChunks } from "@/lib/upload-client";
import type { VideoJob } from "@/lib/workbench-types";
export function BrowserLibrary() {
  const { user } = useAccount();
  const [videos, setVideos] = useState<VideoJob[]>([]),
    [archives, setArchives] = useState<LocalArchive[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!user) return;
    const r = await fetch("/api/workbench", { cache: "no-store" });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    setVideos(data.videos);
    const local: LocalArchive[] = await archiveStore("list", "");
    setArchives(local.filter((a) => a.userId === user.id));
  }, [user]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await load();
      setMessage("操作已完成");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <div className="mt-page-heading">
        <div>
          <p className="mt-eyebrow">YOUR LOCAL LIBRARY</p>
          <h1>本地资料</h1>
          <p>
            将原视频和生成的集锦保存到当前浏览器，确认完整后清理服务器副本。
          </p>
        </div>
      </div>
      <div className="mt-panel p-5 text-sm text-slate-500">
        统计记录和球员档案仍保留在你的账号私有空间，方便累计及管理员发布。视频只留在保存它的浏览器；清理网站数据可能导致丢失，临时网址更换后也不能直接读取旧网址的数据，重要文件请同时下载到设备。保存后如需重新分析，可从这里恢复视频。
      </div>
      {error && (
        <p role="alert" className="mt-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <section className="mt-panel p-6 space-y-4">
        <h2>服务器上的视频</h2>
        {videos.length === 0 ? (
          <p>暂无视频。</p>
        ) : (
          videos.map((v) => (
            <div
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-4"
            >
              <div>
                <strong>{v.name}</strong>
                <p className="text-xs text-slate-500">
                  {v.mediaArchived
                    ? v.mediaCleanupPending
                      ? "已保存到浏览器，服务器清理待重试"
                      : "服务器视频已清理"
                    : `${(v.size / 1024 / 1024).toFixed(
                        1
                      )} MB · 处理完成后可保存`}
                </p>
              </div>
              {!v.mediaArchived && (
                <button
                  className="mt-primary"
                  disabled={busy || ["queued", "running"].includes(v.status)}
                  onClick={() =>
                    void act(() => saveArchive(user!.id, v.id, setMessage))
                  }
                >
                  保存到浏览器并清理视频
                </button>
              )}
            </div>
          ))
        )}
      </section>
      <section className="mt-panel p-6 space-y-4">
        <h2>当前浏览器已保存 · {archives.length}</h2>
        {!archives.length && (
          <p>这里仅显示当前账号在这一个浏览器保存的文件。</p>
        )}
        {archives.map((a) => (
          <article
            key={a.key}
            className="border-b border-slate-100 py-4 space-y-3"
          >
            <h3>{a.name}</h3>
            <div className="flex flex-wrap gap-3">
              {a.files.map((f) => (
                <span key={f.name} className="flex gap-2">
                  <button
                    className="mt-text-link"
                    onClick={() =>
                      downloadBlob(
                        f.blob,
                        f.name === "original-video" ? a.name : f.name
                      )
                    }
                  >
                    下载
                    {f.name === "original-video"
                      ? "原视频"
                      : f.name === "highlights.mp4"
                      ? "完整集锦"
                      : f.name}
                  </button>
                  <button
                    className="mt-text-link"
                    onClick={() => setPreview(URL.createObjectURL(f.blob))}
                  >
                    播放
                  </button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const source = a.files.find(
                      (f) => f.name === "original-video"
                    );
                    if (!source) throw new Error("本地原视频缺失");
                    await uploadVideoChunks(
                      new File([source.blob], a.name),
                      (n) => setMessage(`正在恢复视频 ${n}%`)
                    );
                  })
                }
              >
                恢复视频到服务器
              </button>
              {videos.find((v) => v.id === a.videoId)?.mediaCleanupPending && (
                <button
                  disabled={busy}
                  onClick={() => void act(() => cleanupArchive(a))}
                >
                  重试服务器清理
                </button>
              )}
              <button
                onClick={() =>
                  downloadBlob(
                    new Blob([JSON.stringify(a.metadata, null, 2)], {
                      type: "application/json",
                    }),
                    a.name + ".statistics.json"
                  )
                }
              >
                下载统计结果
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "从当前浏览器移除此视频和集锦？请确认已下载备份；服务器上的视频可能已经清理。"
                    )
                  )
                    void act(() => archiveStore("delete", a.key));
                }}
              >
                移除本地文件
              </button>
            </div>
          </article>
        ))}
      </section>
      {preview && (
        <section className="mt-panel p-5">
          <button className="mt-text-link" onClick={() => setPreview(null)}>
            关闭播放
          </button>
          <video className="mt-4 w-full rounded-xl" src={preview} controls />
        </section>
      )}
    </div>
  );
}
