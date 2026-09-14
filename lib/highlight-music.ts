import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  access,
  readdir,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { workbenchRoot, checkOrigin } from "./workbench-server";
import { presetMusic } from "./highlight-options";
const run = promisify(execFile);
export const musicRoot = () =>
  path.join(workbenchRoot(), "highlights", "music");
export async function musicFile(id: string): Promise<string | null> {
  if (id === "none") return null;
  const preset = presetMusic.find((p) => p.id === id);
  const file = preset
    ? path.join(process.cwd(), "public", preset.url)
    : /^custom-[a-f0-9]{64}$/.test(id)
    ? path.join(musicRoot(), id + ".m4a")
    : null;
  if (!file) throw new Error("背景音乐不存在");
  await access(file);
  return file;
}
export async function listMusic() {
  const files = await readdir(musicRoot()).catch(() => []);
  const custom = await Promise.all(
    files
      .filter((f) => /^custom-[a-f0-9]{64}\.json$/.test(f))
      .map(async (f) =>
        JSON.parse(await readFile(path.join(musicRoot(), f), "utf8"))
      )
  );
  return [...presetMusic, ...custom];
}
export async function receiveMusic(request: Request) {
  checkOrigin(request);
  if (!request.body) throw new Error("请选择音频文件");
  const name = decodeURIComponent(
    request.headers.get("x-audio-name") || "music.mp3"
  ).slice(0, 160);
  if (!/\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(name))
    throw new Error("请选择 MP3、M4A、WAV、AAC、OGG 或 FLAC 音频");
  const max = 30 * 1024 * 1024;
  if (Number(request.headers.get("content-length")) > max)
    throw new Error("音乐不能超过 30 MB");
  await mkdir(musicRoot(), { recursive: true });
  const tmp = path.join(musicRoot(), randomUUID()),
    normalized = tmp + ".m4a";
  const hash = createHash("sha256");
  let size = 0;
  try {
    await pipeline(
      Readable.fromWeb(
        request.body as import("node:stream/web").ReadableStream
      ),
      new Transform({
        transform(chunk, _encoding, callback) {
          size += chunk.length;
          if (size > max) return callback(new Error("音乐不能超过 30 MB"));
          hash.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(tmp)
    );
    if (!size) throw new Error("音频文件为空");
    // Decode untrusted uploads to audio-only AAC; keep at most ten minutes.
    try {
      await run(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          tmp,
          "-map",
          "0:a:0",
          "-vn",
          "-t",
          "600",
          "-c:a",
          "aac",
          "-b:a",
          "160k",
          "-ar",
          "48000",
          "-ac",
          "2",
          normalized,
        ],
        { timeout: 90000, maxBuffer: 1024 * 1024 }
      );
    } catch {
      throw new Error("无法解码音频，请换一个可正常播放的音乐文件");
    }
    const id = "custom-" + hash.digest("hex");
    await rename(normalized, path.join(musicRoot(), id + ".m4a"));
    const item = {
      id,
      name,
      description: "自定义音乐 · 最多保留前 10 分钟",
      url: `/api/highlight-music/${id}`,
    };
    await writeFile(path.join(musicRoot(), id + ".json"), JSON.stringify(item));
    return item;
  } finally {
    await rm(tmp, { force: true });
    await rm(normalized, { force: true });
  }
}
