import { randomUUID, createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  readdir,
  stat,
} from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { workbenchRoot, commitVideo } from "./workbench-server";
export const chunkSize = 8 * 1024 * 1024;
const root = () => path.join(workbenchRoot(), "chunk-uploads");
function directory(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("无效上传编号");
  return path.join(root(), id);
}
type Upload = { name: string; size: number; count: number; createdAt: number };
async function metadata(id: string): Promise<Upload> {
  return JSON.parse(
    await readFile(path.join(directory(id), "meta.json"), "utf8")
  );
}
export async function beginUpload(name: unknown, size: unknown) {
  if (
    typeof name !== "string" ||
    name.length > 200 ||
    !/\.(mp4|mov|webm|mkv)$/i.test(name) ||
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > 500 * 1024 * 1024
  )
    throw new Error("请选择不超过 500 MB 的视频");
  await mkdir(root(), { recursive: true });
  const ids = await readdir(root());
  let active = 0;
  for (const id of ids) {
    const info = await stat(path.join(root(), id));
    if (Date.now() - info.mtimeMs > 86400000)
      await rm(path.join(root(), id), { recursive: true, force: true });
    else active++;
  }
  if (active >= 2) throw new Error("已有上传进行中，请完成或取消后再试");
  const id = randomUUID(),
    dir = directory(id);
  await mkdir(dir);
  const meta = {
    name,
    size,
    count: Math.ceil(size / chunkSize),
    createdAt: Date.now(),
  };
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta));
  return { id, chunkSize, count: meta.count };
}
export async function putChunk(id: string, index: number, request: Request) {
  const meta = await metadata(id);
  if (!Number.isSafeInteger(index) || index < 0 || index >= meta.count)
    throw new Error("分片序号无效");
  const length = Math.min(chunkSize, meta.size - index * chunkSize);
  if (!request.body) throw new Error("空分片");
  const dir = directory(id),
    tmp = path.join(dir, randomUUID() + ".tmp"),
    file = path.join(dir, `${index}.part`);
  let bytes = 0;
  const hash = createHash("sha256");
  try {
    await pipeline(
      Readable.fromWeb(
        request.body as import("node:stream/web").ReadableStream
      ),
      new Transform({
        transform(chunk, _, cb) {
          bytes += chunk.length;
          if (bytes > length) return cb(new Error("分片超出大小"));
          hash.update(chunk);
          cb(null, chunk);
        },
      }),
      createWriteStream(tmp)
    );
    if (bytes !== length) throw new Error("分片不完整");
    const checksum = hash.digest("hex");
    if (checksum !== request.headers.get("x-chunk-sha256"))
      throw new Error("分片校验失败");
    await rename(tmp, file);
    return { ok: true, index };
  } finally {
    await rm(tmp, { force: true });
  }
}
export async function finishUpload(id: string) {
  const dir = directory(id),
    meta = await metadata(id),
    lock = path.join(dir, "finishing");
  await mkdir(lock);
  const temp = path.join(workbenchRoot(), "uploads", randomUUID());
  await mkdir(path.dirname(temp), { recursive: true });
  try {
    for (let n = 0; n < meta.count; n++) {
      const size = (await stat(path.join(dir, `${n}.part`))).size;
      if (size !== Math.min(chunkSize, meta.size - n * chunkSize))
        throw new Error("上传尚未完成");
    }
    const hash = createHash("sha256");
    async function* chunks() {
      for (let n = 0; n < meta.count; n++)
        for await (const piece of createReadStream(
          path.join(dir, `${n}.part`)
        )) {
          hash.update(piece);
          yield piece;
        }
    }
    await pipeline(Readable.from(chunks()), createWriteStream(temp));
    const result = await commitVideo(
      temp,
      meta.name,
      meta.size,
      hash.digest("hex")
    );
    await rm(dir, { recursive: true, force: true });
    return result;
  } finally {
    await rm(temp, { force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
export async function cancelUpload(id: string) {
  const dir = directory(id);
  if (await stat(path.join(dir, "finishing")).catch(() => null))
    throw new Error("正在完成上传，请稍后");
  await rm(dir, { recursive: true, force: true });
  return { ok: true };
}
