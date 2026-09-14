import { listMusic, receiveMusic } from "@/lib/highlight-music";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await listMusic());
}
export async function POST(request: Request) {
  try {
    return Response.json(await receiveMusic(request));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "音乐上传失败" },
      { status: 400 }
    );
  }
}
