import { storageRoot } from "./workspace-context";
import {
  access,
  copyFile,
  mkdir,
  open,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import {
  defaultHighlightOptions,
  parseHighlightOptions,
} from "./highlight-options";
import { musicFile } from "./highlight-music";
import { jobDirectory, transaction, workbenchRoot } from "./workbench-server";

export function highlightDirectory(id: string) {
  jobDirectory(id);
  return path.join(workbenchRoot(), "highlights", "videos", id);
}
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
export async function highlightState(id: string) {
  const dir = highlightDirectory(id);
  const progress = await readFile(path.join(dir, "progress.json"), "utf8")
    .then(JSON.parse)
    .catch(() => null);
  const pid = Number(
    await readFile(path.join(dir, "worker.pid"), "utf8").catch(() => "0")
  );
  if (
    progress &&
    ["queued", "running"].includes(progress.status) &&
    !alive(pid)
  ) {
    return {
      progress: {
        ...progress,
        status: "failed",
        message: "剪辑进程已退出，请重新开始",
      },
      result: await readFile(path.join(dir, "result.json"), "utf8")
        .then(JSON.parse)
        .catch(() => null),
      options: parseHighlightOptions(
        await readFile(path.join(dir, "options.json"), "utf8")
          .then(JSON.parse)
          .catch(() => defaultHighlightOptions)
      ),
    };
  }
  const result = await readFile(path.join(dir, "result.json"), "utf8")
    .then(JSON.parse)
    .catch(() => null);
  const stored = await readFile(path.join(dir, "options.json"), "utf8")
    .then(JSON.parse)
    .catch(() => defaultHighlightOptions);
  return { progress, result, options: parseHighlightOptions(stored) };
}

export async function startHighlights(
  id: string,
  settings?: unknown,
  regenerate = false
) {
  return transaction(async (db) => {
    const video = db.videos.find((v) => v.id === id);
    if (!video) throw new Error("请先上传视频");
    if (video.mediaArchived)
      throw new Error("视频已保存到浏览器，请先从本地资料恢复再剪辑");
    const state = await highlightState(id);
    if (["queued", "running"].includes(state.progress?.status)) {
      if (regenerate) throw new Error("当前正在处理，请完成后再修改剪辑配置");
      return state;
    }
    if (state.progress?.status === "complete" && !regenerate) return state;
    const options = parseHighlightOptions(
      settings ?? state.options ?? defaultHighlightOptions
    );
    const musicPath = await musicFile(options.musicId);
    const root = process.cwd(),
      dir = highlightDirectory(id),
      original = jobDirectory(id);
    await access(path.join(root, ".venv-analysis/bin/python"));
    await access(path.join(root, ".local-run/models/basketball-best.pt"));
    await mkdir(dir, { recursive: true });
    const renderOnly =
      Boolean(state.result) ||
      (await access(path.join(dir, "events.json"))
        .then(() => true)
        .catch(() => false));
    await writeFile(
      path.join(dir, "options.json"),
      JSON.stringify({ ...options, musicPath })
    );
    if (!renderOnly)
      await copyFile(
        path.join(original, "source.video"),
        path.join(dir, "source.video")
      );
    // Only reuse a completed analysis cache. The worker verifies the proxy hash.
    let cached = false;
    if (!renderOnly && video.status === "complete") {
      try {
        await access(path.join(original, "proxy-v2-ready"));
        await copyFile(
          path.join(original, "detection-checkpoint.json"),
          path.join(dir, "detection-checkpoint.json")
        );
        await copyFile(
          path.join(original, "upright.mp4"),
          path.join(dir, "upright.mp4")
        );
        await writeFile(path.join(dir, "proxy-v2-ready"), "ready");
        cached = true;
      } catch {
        /* New uploads run basket detection directly. */
      }
    }
    await writeFile(
      path.join(dir, "progress.json"),
      JSON.stringify({
        status: "queued",
        percent: 0,
        message: "正在准备自动剪辑",
      })
    );
    const log = await open(path.join(dir, "analysis.log"), "a");
    try {
      const child = spawn(
        path.join(root, ".venv-analysis/bin/python"),
        [
          path.join(root, "scripts/analyze-upload.py"),
          "--job-dir",
          dir,
          "--highlights",
          ...(renderOnly ? ["--render-only"] : []),
          ...(cached ? ["--resume-detections"] : []),
        ],
        {
          cwd: root,
          detached: true,
          stdio: ["ignore", log.fd, log.fd],
          env: {
            ...process.env,
            PYTHONUNBUFFERED: "1",
            BASKETBALL_ANALYSIS_LOCK: path.join(storageRoot(), "analysis.lock"),
            YOLO_CONFIG_DIR: path.join(root, ".local-run/yolo-config"),
          },
        }
      );
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      await writeFile(path.join(dir, "worker.pid"), String(child.pid));
      child.unref();
    } catch (e) {
      await writeFile(
        path.join(dir, "progress.json"),
        JSON.stringify({
          status: "failed",
          percent: 0,
          message: "无法启动剪辑，请重试",
        })
      );
      throw e;
    } finally {
      await log.close();
    }
    return highlightState(id);
  });
}
