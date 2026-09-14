import { receiveVideo } from "@/lib/workbench-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    return Response.json(await receiveVideo(request));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "视频上传失败" },
      { status: 400 }
    );
  }
}
