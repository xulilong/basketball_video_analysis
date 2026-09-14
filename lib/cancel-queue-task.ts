import { readFile, writeFile, rename } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { accounts } from "./account-server";
import { rootForUser, workspaceContext } from "./workspace-context";
import { transaction } from "./workbench-server";
const run = promisify(execFile);
async function readProgress(dir: string) {
  return readFile(path.join(dir, "progress.json"), "utf8")
    .then(JSON.parse)
    .catch((e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
}
async function verifiedWorker(pid: number, dir: string, selection: boolean) {
  let output: string;
  try {
    output = (
      await run("ps", ["-p", String(pid), "-o", "pgid=,command="])
    ).stdout.trim();
  } catch (e) {
    if ((e as { code?: number }).code === 1) return false;
    throw e;
  }
  if (!output) return false;
  const match = /^(\d+)\s+(.+)$/.exec(output);
  const script = path.join(
    process.cwd(),
    "scripts",
    selection ? "export-selected-highlights.py" : "analyze-upload.py"
  );
  if (
    !match ||
    Number(match[1]) !== pid ||
    !match[2].includes(script + " ") ||
    !(match[2] + " ").includes((selection ? " " : "--job-dir ") + dir + " ")
  )
    throw new Error("任务进程已变化，请刷新队列后重试");
  return true;
}
export async function cancelQueueTask(taskId: unknown, runId: unknown) {
  if (
    typeof taskId !== "string" ||
    typeof runId !== "string" ||
    !/^\d+$/.test(runId)
  )
    throw new Error("任务参数无效");
  const [userId, videoId, kind, key, ...extra] = taskId.split(":");
  if (
    extra.length ||
    !userId ||
    !/^[a-f0-9]{64}$/.test(videoId) ||
    !["analysis", "highlights", "selection"].includes(kind) ||
    (kind === "selection" ? !/^[a-f0-9-]{36}$/.test(key) : key !== "")
  )
    throw new Error("任务参数无效");
  const user = await accounts((db) => {
    const u = db.users.find((u) => u.id === userId);
    return u ? { id: u.id, username: u.username, role: u.role } : null;
  });
  if (!user) throw new Error("账号不存在");
  return workspaceContext.run(user, () =>
    transaction(async (db) => {
      const video = db.videos.find((v) => v.id === videoId);
      if (!video) throw new Error("视频不存在");
      const root = rootForUser(user);
      const dir =
        kind === "analysis"
          ? path.join(root, "videos", videoId)
          : kind === "highlights"
          ? path.join(root, "highlights/videos", videoId)
          : path.join(root, "highlights/videos", videoId, "selections", key);
      const progress = await readProgress(dir);
      const status =
        progress?.status || (kind === "analysis" ? video.status : undefined);
      if (!["running", "queued"].includes(status))
        return { message: "任务已结束，无需取消" };
      const pid =
        kind === "analysis"
          ? video.pid
          : Number(
              await readFile(path.join(dir, "worker.pid"), "utf8").catch(
                () => "0"
              )
            );
      if (!pid || pid < 2 || String(pid) !== runId)
        throw new Error("任务已重新启动，请刷新队列后再取消");
      if (await verifiedWorker(pid, dir, kind === "selection")) {
        try {
          process.kill(-pid, "SIGTERM");
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
        }
        let active = true;
        for (let n = 0; n < 30; n++) {
          await new Promise((r) => setTimeout(r, 100));
          if (!(await verifiedWorker(pid, dir, kind === "selection"))) {
            active = false;
            break;
          }
        }
        if (active) {
          try {
            process.kill(-pid, "SIGKILL");
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
          }
          for (let n = 0; n < 20; n++) {
            await new Promise((r) => setTimeout(r, 100));
            if (!(await verifiedWorker(pid, dir, kind === "selection"))) {
              active = false;
              break;
            }
          }
          if (active) throw new Error("任务仍在退出，请稍后刷新重试");
        }
      }
      const latest = await readProgress(dir);
      if (latest?.status === "complete")
        return { message: "任务已完成，结果已保留" };
      const tmp = path.join(dir, `progress.${randomUUID()}.tmp`);
      await writeFile(
        tmp,
        JSON.stringify({
          ...latest,
          status: "cancelled",
          stage: "cancelled",
          message: "管理员已取消任务，可重新开始",
          percent: latest?.percent || 0,
        })
      );
      await rename(tmp, path.join(dir, "progress.json"));
      if (kind === "analysis") {
        video.status = "cancelled";
        video.error = "管理员已取消任务，可重新开始";
      }
      return { message: "任务已取消，原视频和已有结果已保留" };
    })
  );
}
