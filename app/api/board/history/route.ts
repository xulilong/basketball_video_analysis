import { readFile } from "node:fs/promises";
import path from "node:path";
import { storageRoot } from "@/lib/workspace-context";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const data = JSON.parse(
      await readFile(
        path.join(storageRoot(), "public-board", "history.json"),
        "utf8"
      )
    );
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return Response.json({ rows: [], importedAt: null });
    return Response.json({ error: "历史数据暂时无法读取" }, { status: 500 });
  }
}
