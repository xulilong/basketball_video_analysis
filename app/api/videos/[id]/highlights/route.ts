import { workspaceRoute } from "@/lib/account-server";
import { highlightState, startHighlights } from "@/lib/highlight-server";
import { checkOrigin } from "@/lib/workbench-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function handleGET(_request: Request, context: Context) {
  try {
    return Response.json(await highlightState((await context.params).id));
  } catch {
    return Response.json({ error: "视频不存在" }, { status: 404 });
  }
}
async function handlePOST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const body = await request.json().catch(() => ({}));
    return Response.json(
      await startHighlights(
        (
          await context.params
        ).id,
        body.options,
        body.regenerate === true
      )
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "无法开始剪辑" },
      { status: 400 }
    );
  }
}

export const GET = workspaceRoute(handleGET);
export const POST = workspaceRoute(handlePOST);
