import { workspaceRoute } from "@/lib/account-server";
import { transaction } from "@/lib/workbench-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handleGET() {
  return Response.json(
    await transaction((db) =>
      db.videos
        .filter((v) => !v.mediaArchived)
        .slice()
        .reverse()
        .slice(0, 20)
        .map(({ id, name }) => ({ id, name }))
    )
  );
}

export const GET = workspaceRoute(handleGET);
