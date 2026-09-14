import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  checkOrigin,
  transaction,
  workbenchRoot,
} from "@/lib/workbench-server";
const run = promisify(execFile);
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  let temp: string | undefined,
    output: string | undefined,
    saved = false;
  try {
    checkOrigin(request);
    const { id } = await context.params;
    if (Number(request.headers.get("content-length")) > 10 * 1024 * 1024)
      throw new Error("照片不能超过 10 MB");
    if (!request.body) throw new Error("请选择照片");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 10 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("照片不能超过 10 MB");
      }
      chunks.push(value);
    }
    if (!size) throw new Error("照片为空");
    const root = path.join(workbenchRoot(), "player-photos");
    await mkdir(root, { recursive: true });
    const photoId = randomUUID();
    temp = path.join(root, photoId + ".upload");
    output = path.join(root, photoId + ".jpg");
    await writeFile(temp, Buffer.concat(chunks));
    try {
      await run(
        path.join(process.cwd(), ".venv-analysis/bin/python"),
        [
          path.join(process.cwd(), "scripts/normalize-player-photo.py"),
          temp,
          output,
        ],
        { timeout: 15000, maxBuffer: 2048 }
      );
    } catch {
      throw new Error("照片无法读取，请上传 JPG、PNG 或 WebP 图片");
    }
    const photo = {
      id: photoId,
      url: `/api/player-photos/${photoId}`,
      createdAt: new Date().toISOString(),
    };
    await transaction((db) => {
      const p = db.players.find((p) => p.id === id);
      if (!p) throw new Error("球员不存在");
      if ((p.referencePhotos?.length ?? 0) >= 8)
        throw new Error("每位球员最多保存 8 张参考照片");
      p.referencePhotos = [...(p.referencePhotos ?? []), photo];
      if (p.referencePhotos.length === 1) p.photo = photo.url;
      p.roster = true;
      p.edited = true;
    });
    saved = true;
    return Response.json(photo);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "上传失败" },
      { status: 400 }
    );
  } finally {
    if (temp) await rm(temp, { force: true });
    if (output && !saved) await rm(output, { force: true });
  }
}
