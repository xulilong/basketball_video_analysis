import { workspaceRoute } from "@/lib/account-server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { jobDirectory } from "@/lib/workbench-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function serve(
  request: Request,
  context: { params: Promise<{ id: string }> },
  head = false
) {
  try {
    const dir = jobDirectory((await context.params).id);
    // Proxy is always an upright MP4. Until conversion completes use original.
    const proxy = path.join(dir, "upright.mp4");
    const file = await stat(path.join(dir, "proxy-ready"))
      .then(() => proxy)
      .catch(() => path.join(dir, "source.video"));
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
      "Content-Type": file === proxy ? "video/mp4" : "application/octet-stream",
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
    };
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
