import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { sampleReviewPath, sampleVideoPath } from "@/lib/local-sample";
import type {
  SampleReview,
  SampleTracklet,
  ShotCandidate,
} from "@/lib/sample-review-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let cached: { signature: string; hash: string } | undefined;
export async function GET() {
  try {
    const video = sampleVideoPath();
    const info = await stat(video);
    const signature = `${video}:${info.size}:${info.mtimeMs}`;
    if (cached?.signature !== signature) {
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(video)) hash.update(chunk);
      cached = { signature, hash: hash.digest("hex") };
    }
    const key = cached!.hash;
    const dir = sampleReviewPath();
    const parse = async (file: string) =>
      JSON.parse(await readFile(path.join(dir, file), "utf8"));
    const tracking = await parse("tracking.json").catch(() => null);
    const motion = await parse("shot-candidates.json").catch(() => null);
    const roster = await parse("roster-candidates.json").catch(() => null);
    const tracklets: SampleTracklet[] = [];
    if (tracking?.videoKey === key) {
      for (const track of roster?.videoKey === key
        ? roster.candidates
        : tracking.tracklets) {
        if (!/^track-\d+\.jpg$/.test(track.photo)) continue;
        const bytes = await readFile(path.join(dir, track.photo));
        tracklets.push({
          id: track.id,
          label: track.label,
          first: track.first,
          last: track.last,
          capturedAt: track.capturedAt,
          observations: track.observations,
          photo: `data:image/jpeg;base64,${bytes.toString("base64")}`,
        });
      }
    }
    const shots: ShotCandidate[] =
      motion?.videoKey === key ? motion.candidates : [];
    const data: SampleReview = {
      rawTrackletCount:
        tracking?.videoKey === key ? tracking.tracklets.length : 0,
      rosterSource:
        roster?.videoKey === key
          ? "人工按外观初步整理，身份与参赛资格待确认"
          : "自动轨迹片段，可能有重复",
      videoKey: key,
      filename: path.basename(video),
      trackingSeconds:
        tracking?.videoKey === key ? tracking.analyzedSeconds : 0,
      scannedSeconds: motion?.videoKey === key ? motion.duration : 0,
      processedFrames:
        tracking?.videoKey === key ? tracking.processedFrames : 0,
      ballFrames: tracking?.videoKey === key ? tracking.ballFrames : 0,
      tracklets,
      shots,
    };
    return Response.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "无法读取本地示例视频或初筛结果" },
      { status: 404 }
    );
  }
}
