import { synchronize, transaction } from "@/lib/workbench-server";
import { highlightState } from "@/lib/highlight-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const videos = await transaction(async (db) => {
      await synchronize(db);
      return db.videos.map(({ id, name, createdAt, status, size }) => ({
        id,
        name,
        createdAt,
        status,
        size,
      }));
    });
    const items = await Promise.all(
      videos.map(async (video) => {
        const state = await highlightState(video.id);
        return {
          ...video,
          highlightStatus: state.progress?.status || null,
          clips: state.result?.clips?.length || 0,
        };
      })
    );
    return Response.json({
      videoCount: items.length,
      analyzedCount: items.filter((v) => v.status === "complete").length,
      clipCount: items.reduce((n, v) => n + v.clips, 0),
      recent: items.reverse().slice(0, 5),
    });
  } catch {
    return Response.json(
      { error: "暂时无法读取工作空间，请稍后重试" },
      { status: 500 }
    );
  }
}
