import { boardTransaction, visibleRow } from "@/lib/public-board";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await boardTransaction((rows) => rows.map(visibleRow)), {
    headers: { "Cache-Control": "no-store" },
  });
}
