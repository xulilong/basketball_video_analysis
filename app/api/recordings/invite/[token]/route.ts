import { workspaceRoute } from "@/lib/account-server";
import { checkOrigin } from "@/lib/workbench-server";
import { inviteInfo, joinRecording } from "@/lib/recordings";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type C = { params: Promise<{ token: string }> };
export const GET = workspaceRoute(async (_: Request, c: C) => {
  try {
    return Response.json(await inviteInfo((await c.params).token));
  } catch {
    return Response.json({ error: "邀请不存在" }, { status: 404 });
  }
});
export const POST = workspaceRoute(async (r: Request, c: C) => {
  try {
    checkOrigin(r);
    const b = await r.json();
    return Response.json(
      await joinRecording((await c.params).token, b.personId, b.team)
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "加入失败" },
      { status: 400 }
    );
  }
});
