import { initializeRoster } from "./default-roster";
import {
  workspaceContext,
  rootForUser,
  storageRoot,
} from "./workspace-context";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  stat,
  access,
  open,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import {
  emptyWorkbench,
  importAnalysis,
  replaceAnalysis,
} from "./workbench-domain";
import type {
  JobProgress,
  VideoAnalysis,
  VideoJob,
  Workbench,
} from "./workbench-types";

export const workbenchRoot = () => {
  const user = workspaceContext.getStore();
  return user ? rootForUser(user) : storageRoot();
};
export function jobDirectory(id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("无效的视频编号");
  return path.join(workbenchRoot(), "videos", id);
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Next may reconstruct request.url with localhost while the browser uses
  // 127.0.0.1. Compare against the actual HTTP Host, without trusting forwarded hosts.
  const url = new URL(request.url);
  // HTTPS terminates at the deployment proxy. Only an operator-configured
  // origin may override the local protocol; never trust forwarded headers.
  const configured = process.env.BASKETBALL_PUBLIC_ORIGIN;
  if (configured) {
    const parsed = new URL(configured);
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.origin !== configured
    )
      throw new Error(
        "BASKETBALL_PUBLIC_ORIGIN 必须是完整来源地址，不含路径或末尾斜杠"
      );
  }
  const expected =
    configured || `${url.protocol}//${request.headers.get("host") || url.host}`;
  if (origin && origin !== expected)
    throw new Error("不接受其他网站发起的修改请求");
}

export async function transaction<T>(
  fn: (db: Workbench) => Promise<T> | T
): Promise<T> {
  const root = workbenchRoot();
  await mkdir(root, { recursive: true });
  const lock = path.join(root, "database.lock");
  let acquired = false;
  for (let i = 0; i < 200; i++) {
    try {
      await mkdir(lock);
      acquired = true;
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const info = await stat(lock).catch(() => null);
      if (info && Date.now() - info.mtimeMs > 60000)
        await rm(lock, { recursive: true, force: true });
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  if (!acquired) throw new Error("记录正在保存，请稍后重试");
  const file = path.join(root, "database.json");
  try {
    let db: Workbench;
    try {
      db = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      db = emptyWorkbench();
    }
    await initializeRoster(db);
    const value = await fn(db);
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(db));
    await rename(temp, file);
    return value;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

export async function receiveVideo(request: Request) {
  checkOrigin(request);
  if (!request.body) throw new Error("请选择视频");
  const name = decodeURIComponent(
    request.headers.get("x-video-name") || "video.mp4"
  ).slice(0, 200);
  if (!/\.(mp4|mov|webm|mkv)$/i.test(name))
    throw new Error("请选择 MP4、MOV、WebM 或 MKV 视频");
  const max = 500 * 1024 * 1024;
  if (Number(request.headers.get("content-length")) > max)
    throw new Error("视频不能超过 500 MB");
  const root = workbenchRoot();
  await mkdir(path.join(root, "uploads"), { recursive: true });
  const temp = path.join(root, "uploads", randomUUID());
  let size = 0;
  const hash = createHash("sha256");
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > max) return callback(new Error("视频不能超过 500 MB"));
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(
        request.body as import("node:stream/web").ReadableStream
      ),
      meter,
      createWriteStream(temp)
    );
    if (!size) throw new Error("视频文件为空");
    const id = hash.digest("hex");
    return await commitVideo(temp, name, size, id);
  } finally {
    await rm(temp, { force: true });
  }
}

export async function commitVideo(
  temp: string,
  name: string,
  size: number,
  id: string
) {
  return await transaction(async (db) => {
    const existing = db.videos.find((v) => v.id === id);
    if (existing) {
      if (existing.mediaArchived) {
        if (existing.mediaCleanupPending)
          throw new Error("请先完成服务器清理，再恢复视频");
        const dir = jobDirectory(id);
        await mkdir(dir, { recursive: true });
        await rename(temp, path.join(dir, "source.video"));
        existing.mediaArchived = false;
        delete existing.archiveReceipt;
        delete existing.mediaCleanupPending;
      }
      return { video: existing, duplicate: true };
    }
    const dir = jobDirectory(id);
    await mkdir(dir, { recursive: true });
    await rename(temp, path.join(dir, "source.video"));
    const video: VideoJob = {
      id,
      name,
      size,
      createdAt: new Date().toISOString(),
      status: "uploaded",
      associations: {},
      autoMatched: [],
    };
    db.videos.push(video);
    return { video, duplicate: false };
  });
}

function alive(pid?: number) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
export async function synchronize(
  db: Workbench
): Promise<Record<string, JobProgress>> {
  const progress: Record<string, JobProgress> = {};
  for (const job of db.videos) {
    if (!["running", "queued"].includes(job.status)) continue;
    const dir = jobDirectory(job.id);
    const p: JobProgress | null = await readFile(
      path.join(dir, "progress.json"),
      "utf8"
    )
      .then(JSON.parse)
      .catch(() => null);
    if (p) progress[job.id] = p;
    if (p?.status === "complete") {
      try {
        const result: VideoAnalysis = JSON.parse(
          await readFile(path.join(dir, "result.json"), "utf8")
        );
        if (job.result) replaceAnalysis(db, job, result);
        else importAnalysis(db, job, result);
      } catch {
        job.status = "failed";
        job.error = "分析结果不完整，请重新分析";
      }
    } else if (p?.status === "failed" || p?.status === "cancelled") {
      job.status = p.status;
      job.error = p.message;
    } else if (!alive(job.pid)) {
      job.status = "failed";
      job.error = "分析进程已退出，可重新开始；已完成的视频不受影响";
    } else if (p) job.status = p.status;
  }
  return progress;
}

export async function startAnalysis(id: string, force = false) {
  const root = process.cwd();
  for (const file of [
    ".venv-analysis/bin/python",
    ".local-run/models/yolo11s.pt",
    ".local-run/models/yolo11s-pose.pt",
    ".local-run/models/basketball-best.pt",
    ".local-run/models/osnet-ain-msmt17.pth",
  ])
    await access(path.join(root, file)).catch(() => {
      throw new Error("本地分析环境或模型缺失，请先完成安装");
    });
  return transaction(async (db) => {
    await synchronize(db);
    const job = db.videos.find((v) => v.id === id);
    if (!job) throw new Error("视频不存在");
    if (job.mediaArchived)
      throw new Error("视频已保存到浏览器，请先从本地资料恢复到服务器再分析");
    if (
      ["running", "queued"].includes(job.status) ||
      (job.status === "complete" && !force)
    )
      return job;
    const dir = jobDirectory(id);
    if (job.result) {
      const archive = path.join(dir, "revisions");
      await mkdir(archive, { recursive: true });
      await writeFile(
        path.join(archive, `${Date.now()}-${randomUUID()}.json`),
        JSON.stringify({ job, players: db.players })
      );
    }
    await rm(path.join(dir, "progress.json"), { force: true });
    await rm(path.join(dir, "result.json"), { force: true });
    const log = await open(path.join(dir, "analysis.log"), "a");
    try {
      const child = spawn(
        path.join(root, ".venv-analysis/bin/python"),
        [path.join(root, "scripts/analyze-upload.py"), "--job-dir", dir],
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
      child.unref();
      job.pid = child.pid;
      job.status = "queued";
      delete job.error;
    } finally {
      await log.close();
    }
    return job;
  });
}

export async function cancelAnalysis(id: string) {
  return transaction(async (db) => {
    await synchronize(db);
    const job = db.videos.find((v) => v.id === id);
    if (!job) throw new Error("视频不存在");
    if (["queued", "running"].includes(job.status)) {
      if (job.pid)
        try {
          process.kill(-job.pid, "SIGTERM");
        } catch {
          /* already stopped */
        }
      job.status = "cancelled";
      job.error = "已停止，可重新开始分析";
    }
    return job;
  });
}
