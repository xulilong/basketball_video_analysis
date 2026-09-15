import { workspaceRoute } from "@/lib/account-server";
import { transaction, checkOrigin } from "@/lib/workbench-server";
import { createProfile, profileFields } from "@/lib/player-profiles";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async () =>
  Response.json(
    await transaction((db) => {
      const p = db.players.find((p) => p.id === db.myProfileId && !p.archived);
      if (!p) return { profile: null };
      const { descriptors, sourceRefs, ...profile } = p;
      return { profile };
    })
  )
);
export const POST = workspaceRoute(async (request: Request) => {
  try {
    checkOrigin(request);
    const body = await request.json();
    return Response.json(
      await transaction((db) => {
        let p = db.players.find(
          (p) => p.id === (body.personId || db.myProfileId) && !p.archived
        );
        if (body.personId) {
          if (!p || !p.roster) throw new Error("请选择自己的有效档案");
        } else if (p) {
          Object.assign(p, profileFields(body));
          p.roster = true;
          p.edited = true;
        } else p = createProfile(db, body);
        db.myProfileId = p.id;
        return { id: p.id };
      })
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "档案保存失败" },
      { status: 400 }
    );
  }
});
