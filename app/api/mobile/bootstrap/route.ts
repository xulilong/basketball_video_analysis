import { sessionUser } from "@/lib/account-server";
import { workspaceContext } from "@/lib/workspace-context";
import { transaction, synchronize } from "@/lib/workbench-server";
import { personStatistics } from "@/lib/workbench-domain";
import { listRecordings } from "@/lib/recordings";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await sessionUser(request);
  if (!user) return Response.json({ user: null }, { headers });
  return workspaceContext.run(user, async () => {
    const records = await listRecordings();
    const data = await transaction(async (db) => {
      await synchronize(db);
      const players = db.players.map(({ descriptors, sourceRefs, ...p }) => p);
      return {
        players,
        stats: personStatistics(db),
        profile:
          players.find((p) => p.id === db.myProfileId && !p.archived) || null,
      };
    });
    return Response.json({ user, records, ...data }, { headers });
  });
}
