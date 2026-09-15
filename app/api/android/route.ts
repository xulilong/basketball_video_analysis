import { readFile } from "node:fs/promises";
import path from "node:path";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const apk = await readFile(
      path.join(process.cwd(), ".local-run/releases/MT-basketball-debug.apk")
    );
    return new Response(new Uint8Array(apk), {
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": 'attachment; filename="MT-basketball-debug.apk"',
        "Content-Length": String(apk.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "安卓内测安装包尚未发布，请先使用网页版本" },
      { status: 404 }
    );
  }
}
