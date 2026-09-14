import { workspaceRoute } from "@/lib/account-server";
import { checkOrigin } from "@/lib/workbench-server";
import { beginUpload } from "@/lib/upload-chunks";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = workspaceRoute(async (request: Request) => {
  try {
    checkOrigin(request);
    const body = await request.json();
    return Response.json(await beginUpload(body.name, body.size));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "上传失败" },
      { status: 400 }
    );
  }
});
