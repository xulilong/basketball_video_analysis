import { workspaceRoute } from "@/lib/account-server";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  checkOrigin,
  synchronize,
  transaction,
  jobDirectory,
} from "@/lib/workbench-server";
import {
  mergePeople,
  personStatistics,
  relinkPerson,
  nextPlayerName,
} from "@/lib/workbench-domain";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handleGET() {
  try {
    return await transaction(async (db) => {
      const progress = await synchronize(db);
      const courts = new Map(
        await Promise.all(
          db.videos.map(async (video) => {
            const court = await readFile(
              path.join(jobDirectory(video.id), "court.json"),
              "utf8"
            )
              .then(JSON.parse)
              .catch(() => undefined);
            return [
              video.id,
              court?.videoKey === video.id ? court : undefined,
            ] as const;
          })
        )
      );
      return Response.json(
        {
          players: personStatistics(db),
          videos: db.videos
            .slice()
            .reverse()
            .map((video) => ({
              ...video,
              court: courts.get(video.id),
              ...(video.result
                ? {
                    result: {
                      ...video.result,
                      // Appearance vectors stay in local persistence; the UI only
                      // needs portraits and events, including during progress polls.
                      players: video.result.players.map((player) => ({
                        ...player,
                        descriptor: [],
                        prototypes: undefined,
                        anchor: undefined,
                      })),
                    },
                  }
                : {}),
            })),
          progress,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    });
  } catch {
    return Response.json({ error: "无法读取本地记录" }, { status: 500 });
  }
}
async function handlePATCH(request: Request) {
  try {
    checkOrigin(request);
    const action = await request.json();
    await transaction(async (db) => {
      await synchronize(db);
      if (action.type === "rename") {
        const p = db.players.find((p) => p.id === action.id);
        if (
          !p ||
          typeof action.name !== "string" ||
          !action.name.trim() ||
          action.name.length > 60
        )
          throw new Error("请输入 1–60 字的球员姓名");
        p.name = action.name.trim();
        p.edited = true;
      } else if (action.type === "merge")
        mergePeople(db, action.source, action.target);
      else if (action.type === "link") {
        let target = action.target;
        if (target === "new") {
          const v = db.videos.find((v) => v.id === action.videoId),
            local = v?.result?.players.find((p) => p.id === action.localId);
          if (!local) throw new Error("未找到本视频中的球员");
          target = randomUUID();
          db.players.push({
            id: target,
            name: nextPlayerName(db),
            photo: local.photo,
            descriptors: [local.descriptor],
            createdAt: new Date().toISOString(),
          });
        }
        relinkPerson(db, action.videoId, action.localId, target);
      } else throw new Error("不支持的操作");
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "保存失败" },
      { status: 400 }
    );
  }
}

export const GET = workspaceRoute(handleGET);
export const PATCH = workspaceRoute(handlePATCH);
