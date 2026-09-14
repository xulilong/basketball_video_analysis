import { workspaceRoute } from "@/lib/account-server";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { sampleReviewPath, sampleVideoPath } from "@/lib/local-sample";
import type { AutomaticScores } from "@/lib/automatic-score-types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handleGET() {
  try {
    const report: AutomaticScores = JSON.parse(
      await readFile(
        path.join(process.cwd(), ".local-run/auto-score/automatic-scores.json"),
        "utf8"
      )
    );
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(sampleVideoPath()))
      hash.update(chunk);
    if (hash.digest("hex") !== report.videoKey) {
      return Response.json(
        { error: "视频已改变，需要重新运行自动分析。" },
        { status: 409 }
      );
    }
    for (const p of report.players) {
      if (!/^track-\d+\.jpg$/.test(p.photo)) throw new Error("Invalid photo");
      p.photo = `data:image/jpeg;base64,${(
        await readFile(path.join(sampleReviewPath(), p.photo))
      ).toString("base64")}`;
    }
    return Response.json(report, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json({ error: "自动分析结果尚未生成。" }, { status: 404 });
  }
}

export const GET = workspaceRoute(handleGET);
