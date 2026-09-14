import { accounts, workspaceRoute } from "@/lib/account-server";
import { currentUser, workspaceContext } from "@/lib/workspace-context";
import { checkOrigin, synchronize, transaction } from "@/lib/workbench-server";
import { personStatistics } from "@/lib/workbench-domain";
import { boardTransaction, publishRow } from "@/lib/public-board";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async (request: Request) => {
  if (currentUser().role !== "admin")
    return Response.json({ error: "仅管理员可访问" }, { status: 403 });
  const users = await accounts((db) =>
    db.users.map(({ id, username, role }) => ({ id, username, role }))
  );
  const selected = new URL(request.url).searchParams.get("user");
  const user = users.find((u) => u.id === selected);
  const stats = user
    ? await workspaceContext.run(user, () =>
        transaction(async (db) => {
          await synchronize(db);
          return personStatistics(db);
        })
      )
    : [];
  return Response.json({
    users,
    stats,
    published: await boardTransaction((rows) => rows),
  });
});
export const POST = workspaceRoute(async (request: Request) => {
  if (currentUser().role !== "admin")
    return Response.json({ error: "仅管理员可操作" }, { status: 403 });
  try {
    checkOrigin(request);
    const body = await request.json();
    if (body.action === "unpublish") {
      await boardTransaction((rows) => {
        const n = rows.findIndex((r) => r.id === body.id);
        if (n < 0) throw new Error("发布记录不存在");
        rows.splice(n, 1);
      });
      return Response.json({ ok: true });
    }
    if (body.action !== "publish") throw new Error("操作不支持");
    const user = await accounts((db) => {
      const u = db.users.find((u) => u.id === body.userId);
      return u ? { id: u.id, username: u.username, role: u.role } : null;
    });
    if (!user) throw new Error("账号不存在");
    const stats = await workspaceContext.run(user, () =>
      transaction(async (db) => {
        await synchronize(db);
        return personStatistics(db);
      })
    );
    const selected = stats.find((p) => p.id === body.personId);
    if (!selected) throw new Error("球员档案不存在");
    const row = {
      sourceUserId: user.id,
      sourcePersonId: selected.id,
      name: selected.name,
      jerseyNumber: selected.jerseyNumber,
      videos: selected.videos,
      made: selected.made,
      knownPoints: selected.knownPoints,
      unknownValue: selected.unknownValue,
    };
    await boardTransaction((rows) => publishRow(rows, row));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "发布失败" },
      { status: 400 }
    );
  }
});
