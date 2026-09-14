import { readFile, stat, readdir } from "node:fs/promises";
import path from "node:path";
import { accounts } from "./account-server";
import { rootForUser } from "./workspace-context";
import type { Workbench } from "./workbench-types";
export type QueueTask = {
  id: string;
  runId: string;
  username: string;
  videoName: string;
  kind: "analysis" | "highlights" | "selection";
  status: string;
  percent: number;
  message: string;
  elapsedSeconds: number | null;
  updatedAt: string | null;
};
const alive = (pid: number) => {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};
async function json(file: string) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
async function pid(file: string) {
  return Number(await readFile(file, "utf8").catch(() => "0"));
}
export async function readTaskQueue() {
  const users = await accounts((db) =>
    db.users.map(({ id, username, role }) => ({ id, username, role }))
  );
  const warnings: string[] = [];
  const groups = await Promise.all(
    users.map(async (user) => {
      const tasks: QueueTask[] = [];
      const root = rootForUser(user);
      try {
        const db: Workbench | null = await json(
          path.join(root, "database.json")
        );
        if (!db) return tasks;
        for (const video of db.videos) {
          if (video.mediaArchived) continue;
          async function collect(
            kind: QueueTask["kind"],
            dir: string,
            worker: number,
            fallback?: string,
            suffix = ""
          ) {
            const file = path.join(dir, "progress.json");
            const progress = await json(file);
            let status = progress?.status || fallback;
            if (!status || status === "uploaded") return;
            const info = await stat(file).catch(() => null);
            const active = ["queued", "running"].includes(status);
            let message = progress?.message || "正在准备任务";
            if (active && !alive(worker)) {
              status = "failed";
              message = "处理进程已退出，可回到对应工具重试";
            }
            tasks.push({
              id: `${user.id}:${video.id}:${kind}:${suffix}`,
              runId: String(worker),
              username: user.username,
              videoName: video.name,
              kind,
              status,
              percent: Math.min(
                100,
                Math.max(
                  0,
                  Number(progress?.percent) || (status === "complete" ? 100 : 0)
                )
              ),
              message,
              elapsedSeconds:
                status === "queued"
                  ? null
                  : Number.isFinite(progress?.elapsedSeconds)
                  ? progress.elapsedSeconds
                  : null,
              updatedAt: info?.mtime.toISOString() || null,
            });
          }
          await collect(
            "analysis",
            path.join(root, "videos", video.id),
            video.pid || 0,
            video.status
          );
          const highlights = path.join(root, "highlights/videos", video.id);
          await collect(
            "highlights",
            highlights,
            await pid(path.join(highlights, "worker.pid"))
          );
          const selectionRoot = path.join(highlights, "selections");
          const selections = await readdir(selectionRoot).catch(() => []);
          for (const key of selections.filter((k) =>
            /^[a-f0-9-]{36}$/.test(k)
          )) {
            const dir = path.join(selectionRoot, key);
            await collect(
              "selection",
              dir,
              await pid(path.join(dir, "worker.pid")),
              undefined,
              key
            );
          }
        }
      } catch {
        warnings.push(`${user.username} 的部分任务暂时无法读取`);
      }
      return tasks;
    })
  );
  const all = groups.flat();
  const active = all
    .filter((t) => ["running", "queued"].includes(t.status))
    .sort(
      (a, b) =>
        (a.status === "running" ? 0 : 1) - (b.status === "running" ? 0 : 1) ||
        (a.updatedAt || "").localeCompare(b.updatedAt || "")
    );
  const recent = all
    .filter((t) => !["running", "queued"].includes(t.status))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .slice(0, 30);
  return {
    active,
    recent,
    warnings,
    counts: {
      running: active.filter((t) => t.status === "running").length,
      queued: active.filter((t) => t.status === "queued").length,
    },
    updatedAt: new Date().toISOString(),
  };
}
