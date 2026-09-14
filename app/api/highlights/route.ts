import { transaction } from "@/lib/workbench-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(
    await transaction((db) =>
      db.videos
        .slice()
        .reverse()
        .slice(0, 20)
        .map(({ id, name }) => ({ id, name }))
    )
  );
}
