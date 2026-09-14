import { workspaceRoute } from "@/lib/account-server";
import { listMusic, receiveMusic } from "@/lib/highlight-music";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handleGET() {
  return Response.json(await listMusic());
}
async function handlePOST(request: Request) {
  try {
    return Response.json(await receiveMusic(request));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "音乐上传失败" },
      { status: 400 }
    );
  }
}

export const GET = workspaceRoute(handleGET);
export const POST = workspaceRoute(handlePOST);
