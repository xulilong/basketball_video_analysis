import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { sampleVideoPath } from "@/lib/local-sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serve(request: Request, head = false) {
  try {
    const file = sampleVideoPath();
    const { size } = await stat(file);
    let start = 0,
      end = size - 1;
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      if (!match[1]) start = Math.max(0, size - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= size
      )
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
    }
    const headers: Record<string, string> = {
      "Content-Type": "video/mp4",
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
    return Response.json({ error: "未找到本地示例.mp4" }, { status: 404 });
  }
}
export const GET = (request: Request) => serve(request);
export const HEAD = (request: Request) => serve(request, true);
