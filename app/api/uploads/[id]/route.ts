import { workspaceRoute } from "@/lib/account-server";
import { checkOrigin } from "@/lib/workbench-server";
import { putChunk, finishUpload, cancelUpload } from "@/lib/upload-chunks";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function handle(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const { id } = await context.params;
    return Response.json(
      request.method === "PUT"
        ? await putChunk(
            id,
            Number(new URL(request.url).searchParams.get("index")),
            request
          )
        : request.method === "PATCH"
        ? await finishUpload(id)
        : await cancelUpload(id)
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "上传失败" },
      { status: 400 }
    );
  }
}
export const PUT = workspaceRoute(handle);
export const PATCH = workspaceRoute(handle);
export const DELETE = workspaceRoute(handle);
