import { selectionDirectory, selectionState } from "@/lib/highlight-selection";
import { workspaceRoute } from "@/lib/account-server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { highlightDirectory, highlightState } from "@/lib/highlight-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function serve(
  request: Request,
  context: { params: Promise<{ id: string }> },
  head = false
) {
  try {
    const id = (await context.params).id;
    const dir = highlightDirectory(id);
    const url = new URL(request.url);
    const name = url.searchParams.get("file") || "highlights.mp4";
    const state = await highlightState(id);
    if (!state.result?.clips?.length) throw new Error("集锦尚未完成");
    if (
      name !== "highlights.mp4" &&
      !state.result.clips.some((clip: { file: string }) => clip.file === name)
    )
      throw new Error("片段不存在");
    if (!/^(highlights|clip-\d{3,})\.mp4$/.test(name))
      throw new Error("无效文件名");
    const generation = state.result.generation;
    if (generation && !/^[a-f0-9]{32}$/.test(generation))
      throw new Error("无效导出版本");
    const selection = url.searchParams.get("selection");
    if (
      selection &&
      (name !== "highlights.mp4" ||
        (await selectionState(id, selection)).status !== "complete")
    )
      throw new Error("导出尚未完成");
    const file = selection
      ? path.join(selectionDirectory(id, selection), "highlights.mp4")
      : generation
      ? path.join(dir, "exports", generation, name)
      : path.join(dir, name);
    const { size } = await stat(file);
    let start = 0,
      end = size - 1;
    const range = request.headers.get("range");
    const invalid = () =>
      new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m || (!m[1] && !m[2])) return invalid();
      if (!m[1]) {
        if (Number(m[2]) === 0) return invalid();
        start = Math.max(0, size - Number(m[2]));
      } else {
        start = Number(m[1]);
        if (m[2]) end = Math.min(end, Number(m[2]));
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= size
      )
        return invalid();
    }
    const headers: Record<string, string> = {
      "Content-Type": "video/mp4",
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
    };
    if (url.searchParams.get("download") === "1")
      headers["Content-Disposition"] = `attachment; filename="MT-${
        selection ? "selected-highlights.mp4" : name
      }"`;
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    return new Response(
      head
        ? null
        : (Readable.toWeb(
            createReadStream(file, { start, end })
          ) as ReadableStream),
      { status: range ? 206 : 200, headers }
    );
  } catch {
    return Response.json({ error: "视频不存在" }, { status: 404 });
  }
}
const handleGET = (r: Request, c: { params: Promise<{ id: string }> }) =>
  serve(r, c);
const handleHEAD = (r: Request, c: { params: Promise<{ id: string }> }) =>
  serve(r, c, true);

export const GET = workspaceRoute(handleGET);
export const HEAD = workspaceRoute(handleHEAD);
