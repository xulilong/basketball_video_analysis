import { workspaceRoute } from "@/lib/account-server";
import { checkOrigin } from "@/lib/workbench-server";
import {
  getRecording,
  exportRecording,
  attachRecording,
  updateRecordingMembers,
} from "@/lib/recordings";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type C = { params: Promise<{ id: string }> };
export const GET = workspaceRoute(async (_: Request, c: C) => {
  try {
    return Response.json(await getRecording((await c.params).id));
  } catch {
    return Response.json({ error: "记录不存在" }, { status: 404 });
  }
});
export const POST = workspaceRoute(async (r: Request, c: C) => {
  try {
    checkOrigin(r);
    const b = await r.json(),
      id = (await c.params).id;
    return Response.json(
      b.action === "export"
        ? await exportRecording(id, b.retry === true)
        : b.action === "members"
        ? await updateRecordingMembers(id, b.members)
        : await attachRecording(id, b.videoId)
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "处理失败" },
      { status: 400 }
    );
  }
});
