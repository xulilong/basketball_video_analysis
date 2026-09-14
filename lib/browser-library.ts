export type LocalArchive = {
  key: string;
  userId: string;
  videoId: string;
  name: string;
  savedAt: string;
  receiptId: string;
  checksums: string[];
  files: { name: string; blob: Blob }[];
  metadata: unknown;
};
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("mt-private-video-library", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("archives", { keyPath: "key" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function archiveStore(
  mode: "put" | "get" | "list" | "delete",
  value: LocalArchive | string
): Promise<any> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(
        "archives",
        mode === "put" || mode === "delete" ? "readwrite" : "readonly"
      );
      const store = tx.objectStore("archives");
      const r =
        mode === "put"
          ? store.put(value)
          : mode === "delete"
          ? store.delete(value as string)
          : mode === "get"
          ? store.get(value as string)
          : store.getAll();
      let result: unknown;
      r.onsuccess = () => {
        result = r.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("浏览器保存已中止"));
    });
  } finally {
    db.close();
  }
}
const sha = async (blob: Blob) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())
    )
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
export async function saveArchive(
  userId: string,
  videoId: string,
  progress: (message: string) => void
) {
  const r = await fetch(`/api/videos/${videoId}/archive`, {
    cache: "no-store",
  });
  const plan = await r.json();
  if (!r.ok) throw new Error(plan.error);
  const estimate = await navigator.storage?.estimate?.();
  const size = plan.files.reduce(
    (n: number, f: { bytes: number }) => n + f.bytes,
    0
  );
  if (estimate?.quota && estimate.quota - (estimate.usage || 0) < size * 1.1)
    throw new Error(
      "浏览器可用空间不足，服务器文件尚未删除。请先释放本地空间。"
    );
  await navigator.storage?.persist?.().catch(() => false);
  const files: { name: string; blob: Blob }[] = [];
  for (const [index, file] of plan.files.entries()) {
    progress(`正在保存 ${index + 1} / ${plan.files.length} 个文件`);
    const response = await fetch(file.url, { cache: "no-store" });
    if (!response.ok) throw new Error("文件下载失败，服务器副本已保留");
    const blob = await response.blob();
    if (blob.size !== file.bytes || (await sha(blob)) !== file.sha256)
      throw new Error("文件校验失败，服务器副本已保留");
    files.push({ name: file.name, blob });
  }
  const archive: LocalArchive = {
    key: `${userId}:${videoId}`,
    userId,
    videoId,
    name: plan.videoName,
    savedAt: new Date().toISOString(),
    receiptId: plan.id,
    checksums: plan.files.map((f: { sha256: string }) => f.sha256),
    files,
    metadata: plan,
  };
  await archiveStore("put", archive);
  progress("正在验证浏览器保存结果…");
  const saved: LocalArchive = await archiveStore("get", archive.key);
  if (!saved || saved.files.length !== files.length)
    throw new Error("浏览器保存不完整，服务器文件未清理");
  for (let n = 0; n < saved.files.length; n++)
    if ((await sha(saved.files[n].blob)) !== archive.checksums[n])
      throw new Error("浏览器保存校验失败，服务器文件未清理");
  progress("本地保存成功，正在清理服务器视频副本…");
  await cleanupArchive(saved);
  return saved;
}
export async function cleanupArchive(archive: LocalArchive) {
  const response = await fetch(`/api/videos/${archive.videoId}/archive`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      receiptId: archive.receiptId,
      checksums: archive.checksums,
    }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error("已保存到浏览器，但服务器清理未完成：" + data.error);
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
