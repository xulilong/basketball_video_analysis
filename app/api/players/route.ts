import { transaction, checkOrigin } from "@/lib/workbench-server";
import { personStatistics, mergePeople } from "@/lib/workbench-domain";
import { createProfile, profileFields } from "@/lib/player-profiles";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(
    await transaction((db) => ({
      players: db.players.map((p) => {
        const { descriptors, ...profile } = p;
        return { ...profile, referencePhotos: p.referencePhotos ?? [] };
      }),
      stats: personStatistics(db),
    }))
  );
}
export async function POST(r: Request) {
  try {
    checkOrigin(r);
    const body = await r.json();
    return Response.json(
      await transaction((db) => {
        const p = createProfile(db, body);
        return { id: p.id };
      })
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "新增失败" },
      { status: 400 }
    );
  }
}
export async function PATCH(r: Request) {
  try {
    checkOrigin(r);
    const body = await r.json();
    await transaction((db) => {
      const p = db.players.find((p) => p.id === body.id);
      if (!p) throw new Error("球员不存在");
      if (body.type === "edit") {
        Object.assign(p, profileFields(body));
        p.roster = true;
        p.edited = true;
      } else if (body.type === "archive") {
        if (typeof body.archived !== "boolean") throw new Error("状态无效");
        p.archived = body.archived;
        p.edited = true;
      } else if (body.type === "cover") {
        const photo = p.referencePhotos?.find((f) => f.id === body.photoId);
        if (!photo) throw new Error("照片不存在");
        p.photo = photo.url;
      } else if (body.type === "removePhoto") {
        const photo = p.referencePhotos?.find((f) => f.id === body.photoId);
        if (!photo) throw new Error("照片不存在");
        p.referencePhotos = p.referencePhotos!.filter((f) => f.id !== photo.id);
        if (p.photo === photo.url)
          p.photo =
            p.referencePhotos[0]?.url ?? "/assets/player-placeholder.svg";
      } else if (body.type === "merge") {
        const target = db.players.find((p) => p.id === body.target);
        if (!target?.roster || target.archived)
          throw new Error("请选择有效的正式球员档案");
        mergePeople(db, p.id, target.id);
      } else throw new Error("不支持的操作");
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "保存失败" },
      { status: 400 }
    );
  }
}
