import { readFile, writeFile, mkdir, open, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  highlightDirectory,
  highlightState,
  selectionRunning,
} from "./highlight-server";
import { transaction, jobDirectory } from "./workbench-server";
import { parseHighlightOptions } from "./highlight-options";
import { musicFile } from "./highlight-music";
export function selectClips(
  clips: { file: string; start: number; end: number }[],
  files: unknown
) {
  if (
    !Array.isArray(files) ||
    !files.length ||
    files.length > clips.length ||
    files.some((f) => typeof f !== "string") ||
    new Set(files).size !== files.length
  )
    throw new Error("请至少选择一个有效片段");
  const selected = clips.filter((c) => files.includes(c.file));
  if (selected.length !== files.length)
    throw new Error("片段已更新，请刷新后重新选择");
  return selected;
}
export function selectionDirectory(id: string, key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("导出记录无效");
  return path.join(highlightDirectory(id), "selections", key);
}
export async function selectionState(id: string, key: string) {
  const dir = selectionDirectory(id, key);
  const state = JSON.parse(
    await readFile(path.join(dir, "progress.json"), "utf8")
  );
  if (state.status === "running" && !(await selectionRunning(id)))
    return {
      ...state,
      status: "failed",
      message: "导出进程已退出，请重新导出",
    };
  return state;
}
export async function startSelection(
  id: string,
  files: unknown,
  generation: unknown
) {
  return transaction(async (db) => {
    const video = db.videos.find((v) => v.id === id);
    if (!video || video.mediaArchived) throw new Error("请先恢复视频素材");
    const state = await highlightState(id);
    if (
      ["queued", "running"].includes(state.progress?.status) ||
      (await selectionRunning(id))
    )
      throw new Error("当前正在处理，请完成后再导出");
    if (
      !state.result?.clips?.length ||
      (state.result.generation || "original") !== generation
    )
      throw new Error("片段已更新，请刷新后重新选择");
    const clips = selectClips(state.result.clips, files);
    const options = parseHighlightOptions(
      state.result.options || state.options
    );
    const musicPath = await musicFile(options.musicId);
    const source = path.join(jobDirectory(id), "source.video");
    await access(source);
    const key = randomUUID(),
      dir = selectionDirectory(id, key);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "request.json"),
      JSON.stringify({ source, clips, options: { ...options, musicPath } })
    );
    await writeFile(
      path.join(dir, "progress.json"),
      JSON.stringify({
        status: "running",
        percent: 0,
        message: "正在准备选中片段",
      })
    );
    const log = await open(path.join(dir, "export.log"), "a");
    try {
      const child = spawn(
        path.join(process.cwd(), ".venv-analysis/bin/python"),
        [
          path.join(process.cwd(), "scripts/export-selected-highlights.py"),
          dir,
        ],
        { detached: true, stdio: ["ignore", log.fd, log.fd] }
      );
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      await writeFile(
        path.join(highlightDirectory(id), "selection-worker.pid"),
        String(child.pid)
      );
      child.unref();
    } catch (e) {
      await writeFile(
        path.join(dir, "progress.json"),
        JSON.stringify({ status: "failed", message: "导出启动失败，请重试" })
      );
      throw e;
    } finally {
      await log.close();
    }
    return { key };
  });
}
