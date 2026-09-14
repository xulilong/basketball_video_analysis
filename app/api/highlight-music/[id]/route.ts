import { workspaceRoute } from "@/lib/account-server";
import { musicFile } from "@/lib/highlight-music";
import { readFile } from "node:fs/promises";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handleGET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const file = await musicFile((await context.params).id);
    if (!file) throw new Error();
    return new Response(new Uint8Array(await readFile(file)), {
      headers: {
        "Content-Type": "audio/mp4",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "音乐不存在" }, { status: 404 });
  }
}

export const GET = workspaceRoute(handleGET);
