"use client";
import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
export function SelectedHighlightExport({
  id,
  generation,
  files,
  onBusy,
}: {
  id: string;
  generation: string;
  files: string[];
  onBusy: (busy: boolean) => void;
}) {
  const [key, setKey] = useState(""),
    [status, setStatus] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [signature, setSignature] = useState("");
  const current = JSON.stringify(files);
  useEffect(() => {
    if (!key || status !== "running") return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const r = await fetch(
          `/api/videos/${id}/highlights/selection?key=${key}`,
          { cache: "no-store" }
        );
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (live) {
          setStatus(data.status);
          setMessage(data.message);
          setError("");
          if (data.status !== "running") {
            onBusy(false);
            return;
          }
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "读取进度失败");
      }
      if (live) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [id, key, status, onBusy]);
  async function start() {
    setError("");
    setStatus("starting");
    onBusy(true);
    setSignature(current);
    try {
      const r = await fetch(`/api/videos/${id}/highlights/selection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generation, files }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setKey(data.key);
      setStatus("running");
      setMessage("正在合成选中片段…");
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
      setStatus("failed");
      onBusy(false);
    }
  }
  const busy = status === "running" || status === "starting";
  return (
    <div className="space-y-2">
      <button
        className="mt-primary"
        disabled={!files.length || busy}
        onClick={() => void start()}
      >
        {busy ? (
          <Loader2 size={17} className="animate-spin" />
        ) : (
          <Download size={17} />
        )}{" "}
        {busy ? "正在合成…" : `合成选中片段（${files.length}）`}
      </button>
      {status === "complete" && signature === current && (
        <a
          className="mt-primary"
          href={`/api/videos/${id}/highlights/media?selection=${key}&download=1`}
        >
          下载选中集锦 MP4 <Download size={17} />
        </a>
      )}
      {message && signature === current && (
        <p role="status" className="text-xs text-slate-500">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-error">
          {error}
        </p>
      )}
    </div>
  );
}
