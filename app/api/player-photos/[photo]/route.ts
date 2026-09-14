import { workspaceRoute } from "@/lib/account-server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { transaction, workbenchRoot } from "@/lib/workbench-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handleGET(
  _r: Request,
  c: { params: Promise<{ photo: string }> }
) {
  try {
    const { photo } = await c.params;
    if (!/^[a-f0-9-]{36}$/.test(photo)) throw new Error();
    const exists = await transaction((db) =>
      db.players.some((p) => p.referencePhotos?.some((f) => f.id === photo))
    );
    if (!exists) throw new Error();
    const image = await readFile(
      path.join(workbenchRoot(), "player-photos", photo + ".jpg")
    );
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "照片不存在" }, { status: 404 });
  }
}

export const GET = workspaceRoute(handleGET);
