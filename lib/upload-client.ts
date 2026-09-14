import type { VideoJob } from "./workbench-types";
async function json(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "上传失败");
  return data;
}
export async function uploadVideoChunks(
  file: File,
  onProgress: (n: number) => void,
  signal?: AbortSignal
): Promise<{ video: VideoJob; duplicate: boolean }> {
  const upload = await json(
    await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size }),
      signal,
    })
  );
  try {
    for (let n = 0; n < upload.count; n++) {
      const part = file.slice(
        n * upload.chunkSize,
        Math.min(file.size, (n + 1) * upload.chunkSize)
      );
      const sha = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await part.arrayBuffer())
        )
      )
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      let error: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await json(
            await fetch(`/api/uploads/${upload.id}?index=${n}`, {
              method: "PUT",
              headers: {
                "Content-Type": "application/octet-stream",
                "X-Chunk-Sha256": sha,
              },
              body: part,
              signal,
            })
          );
          error = null;
          break;
        } catch (e) {
          error = e;
          if (signal?.aborted) throw e;
        }
      }
      if (error) throw error;
      onProgress(Math.min(99, Math.round(((n + 1) / upload.count) * 99)));
    }
    const result = await json(
      await fetch(`/api/uploads/${upload.id}`, { method: "PATCH", signal })
    );
    onProgress(100);
    return result;
  } catch (e) {
    await fetch(`/api/uploads/${upload.id}`, { method: "DELETE" }).catch(
      () => {}
    );
    throw e;
  }
}
