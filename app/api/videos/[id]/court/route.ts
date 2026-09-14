import { workspaceRoute } from "@/lib/account-server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { jobDirectory } from "@/lib/workbench-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handleGET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const image = await readFile(
      path.join(jobDirectory((await context.params).id), "court-line.jpg")
    );
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "本视频暂无三分线标定" }, { status: 404 });
  }
}

export const GET = workspaceRoute(handleGET);
