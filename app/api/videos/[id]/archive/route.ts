import { workspaceRoute } from "@/lib/account-server";
import { checkOrigin } from "@/lib/workbench-server";
import { prepareArchive, releaseArchive } from "@/lib/archive-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export const GET = workspaceRoute(
  async (request: Request, context: Context) => {
    try {
      return Response.json(await prepareArchive((await context.params).id));
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "准备失败" },
        { status: 400 }
      );
    }
  }
);
export const DELETE = workspaceRoute(
  async (request: Request, context: Context) => {
    try {
      checkOrigin(request);
      const body = await request.json();
      return Response.json(
        await releaseArchive(
          (
            await context.params
          ).id,
          body.receiptId,
          body.checksums
        )
      );
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "清理失败" },
        { status: 400 }
      );
    }
  }
);
