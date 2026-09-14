import { workspaceRoute } from "@/lib/account-server";
import {
  cancelAnalysis,
  checkOrigin,
  startAnalysis,
} from "@/lib/workbench-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handlePOST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    checkOrigin(request);
    const options = await request.json().catch(() => ({}));
    return Response.json(
      await startAnalysis((await context.params).id, options.force === true)
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "无法开始分析" },
      { status: 400 }
    );
  }
}
async function handleDELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    checkOrigin(request);
    return Response.json(await cancelAnalysis((await context.params).id));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "无法停止分析" },
      { status: 400 }
    );
  }
}

export const POST = workspaceRoute(handlePOST);
export const DELETE = workspaceRoute(handleDELETE);
