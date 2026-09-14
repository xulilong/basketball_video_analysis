import { workspaceRoute } from "@/lib/account-server";
import { checkOrigin } from "@/lib/workbench-server";
import { startSelection, selectionState } from "@/lib/highlight-selection";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export const POST = workspaceRoute(async (r: Request, c: Context) => {
  try {
    checkOrigin(r);
    const body = await r.json();
    return Response.json(
      await startSelection((await c.params).id, body.files, body.generation)
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "导出失败" },
      { status: 400 }
    );
  }
});
export const GET = workspaceRoute(async (r: Request, c: Context) => {
  try {
    return Response.json(
      await selectionState(
        (
          await c.params
        ).id,
        new URL(r.url).searchParams.get("key") || ""
      )
    );
  } catch {
    return Response.json({ error: "导出记录不存在" }, { status: 404 });
  }
});
