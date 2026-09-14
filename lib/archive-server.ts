import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile, stat, rm } from "node:fs/promises";
import path from "node:path";
import {
  transaction,
  synchronize,
  jobDirectory,
  workbenchRoot,
} from "./workbench-server";
import { highlightState, highlightDirectory } from "./highlight-server";
import { personStatistics } from "./workbench-domain";
export type ArchiveFile = {
  name: string;
  url: string;
  bytes: number;
  sha256: string;
};
const plans = () => path.join(workbenchRoot(), "archive-plans");
async function describe(
  name: string,
  url: string,
  file: string
): Promise<ArchiveFile> {
  const hash = createHash("sha256");
  for await (const data of createReadStream(file)) hash.update(data);
  return {
    name,
    url,
    bytes: (await stat(file)).size,
    sha256: hash.digest("hex"),
  };
}
const revision = (video: unknown, highlight: unknown) =>
  createHash("sha256")
    .update(JSON.stringify([video, highlight]))
    .digest("hex");
export async function prepareArchive(id: string) {
  return transaction(async (db) => {
    await synchronize(db);
    const video = db.videos.find((v) => v.id === id);
    if (!video) throw new Error("视频不存在");
    if (video.mediaArchived)
      throw new Error("视频已保存在原浏览器，请在那里打开本地资料");
    const highlights = await highlightState(id);
    if (
      ["queued", "running"].includes(video.status) ||
      ["queued", "running"].includes(highlights.progress?.status)
    )
      throw new Error("正在处理，完成后才能保存并清理");
    if (
      video.status !== "complete" &&
      highlights.progress?.status !== "complete"
    )
      throw new Error("请先完成分析或剪辑");
    const files: ArchiveFile[] = [
      await describe(
        "original-video",
        `/api/videos/${id}/media`,
        path.join(jobDirectory(id), "source.video")
      ),
    ];
    if (highlights.result?.clips?.length) {
      const gen = highlights.result.generation;
      if (gen && !/^[a-f0-9]{32}$/.test(gen)) throw new Error("无效导出版本");
      const dir = gen
        ? path.join(highlightDirectory(id), "exports", gen)
        : highlightDirectory(id);
      for (const name of [
        "highlights.mp4",
        ...highlights.result.clips.map((c: { file: string }) => c.file),
      ]) {
        if (!/^(highlights|clip-\d{3,})\.mp4$/.test(name))
          throw new Error("无效导出文件");
        files.push(
          await describe(
            name,
            `/api/videos/${id}/highlights/media?file=${name}`,
            path.join(dir, name)
          )
        );
      }
    }
    const plan = {
      id: randomUUID(),
      videoId: id,
      videoName: video.name,
      files,
      createdAt: new Date().toISOString(),
      revision: revision(video, highlights.result),
      statistics: personStatistics(db),
      video,
      highlights: highlights.result,
    };
    await mkdir(plans(), { recursive: true });
    await writeFile(path.join(plans(), id + ".json"), JSON.stringify(plan));
    return plan;
  });
}
export async function releaseArchive(
  id: string,
  receiptId: string,
  checksums: unknown
) {
  jobDirectory(id);
  const plan = JSON.parse(
    await readFile(path.join(plans(), id + ".json"), "utf8")
  );
  if (
    plan.id !== receiptId ||
    JSON.stringify(plan.files.map((f: ArchiveFile) => f.sha256)) !==
      JSON.stringify(checksums)
  )
    throw new Error("浏览器保存凭据不匹配，未清理任何文件");
  await transaction(async (db) => {
    await synchronize(db);
    const video = db.videos.find((v) => v.id === id);
    if (!video) throw new Error("视频不存在");
    if (video.archiveReceipt === receiptId && video.mediaArchived) return;
    const state = await highlightState(id);
    if (
      ["queued", "running"].includes(video.status) ||
      ["queued", "running"].includes(state.progress?.status)
    )
      throw new Error("任务正在运行，不能清理");
    if (revision(video, state.result) !== plan.revision)
      throw new Error("结果已更新，请重新保存最新版本");
    video.mediaArchived = true;
    video.archiveReceipt = receiptId;
    video.mediaCleanupPending = true;
  });
  // Receipt is persisted first, so a failed/interrupted cleanup can be retried.
  await rm(jobDirectory(id), { recursive: true, force: true });
  await rm(highlightDirectory(id), { recursive: true, force: true });
  await transaction((db) => {
    const video = db.videos.find((v) => v.id === id);
    if (video?.archiveReceipt === receiptId) video.mediaCleanupPending = false;
  });
  return { ok: true };
}
