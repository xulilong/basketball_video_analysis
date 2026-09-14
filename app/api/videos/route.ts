import { workspaceRoute } from "@/lib/account-server";
import { receiveVideo } from "@/lib/workbench-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handlePOST(request: Request) {
  try {
    return Response.json(await receiveVideo(request));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "视频上传失败" },
      { status: 400 }
    );
  }
}

export const POST = workspaceRoute(handlePOST);
