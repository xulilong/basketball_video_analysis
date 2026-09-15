import { workspaceRoute } from "@/lib/account-server";
import { checkOrigin } from "@/lib/workbench-server";
import { listRecordings, createRecording } from "@/lib/recordings";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async () =>
  Response.json(await listRecordings())
);
export const POST = workspaceRoute(async (r: Request) => {
  try {
    checkOrigin(r);
    return Response.json(await createRecording(await r.json()));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "创建失败" },
      { status: 400 }
    );
  }
});
