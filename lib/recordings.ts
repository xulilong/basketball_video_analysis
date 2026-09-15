import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  stat,
  copyFile,
} from "node:fs/promises";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import path from "node:path";
import {
  storageRoot,
  currentUser,
  workspaceContext,
  rootForUser,
} from "./workspace-context";
import { accounts } from "./account-server";
import { transaction, synchronize, startAnalysis } from "./workbench-server";
import { startHighlights, highlightState } from "./highlight-server";
import { personStatistics } from "./workbench-domain";
import { createProfile } from "./player-profiles";
import { recordingClips } from "./recording-clips";
import { startSelection, selectionState } from "./highlight-selection";
import type { Recording } from "./recording-types";
async function store<T>(fn: (rows: Recording[]) => Promise<T> | T) {
  const dir = path.join(storageRoot(), "recordings");
  await mkdir(dir, { recursive: true });
  const lock = path.join(dir, "lock");
  let got = false;
  for (let i = 0; i < 200; i++) {
    try {
      await mkdir(lock);
      got = true;
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const s = await stat(lock).catch(() => null);
      if (s && Date.now() - s.mtimeMs > 60000)
        await rm(lock, { recursive: true, force: true });
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  if (!got) throw new Error("记录正在更新，请重试");
  try {
    const file = path.join(dir, "records.json");
    const rows: Recording[] = await readFile(file, "utf8")
      .then(JSON.parse)
      .catch((e) => {
        if (e.code === "ENOENT") return [];
        throw e;
      });
    const result = await fn(rows);
    const tmp = file + "." + randomUUID();
    await writeFile(tmp, JSON.stringify(rows));
    await rename(tmp, file);
    return result;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
const title = (v: unknown, fallback: string) => {
  if (v === undefined || v === "") return fallback;
  if (typeof v !== "string" || v.trim().length > 60)
    throw new Error("名称不能超过60字");
  return v.trim() || fallback;
};
export async function listRecordings() {
  const owner = currentUser().id;
  return store((rows) =>
    rows
      .filter((r) => r.ownerId === owner)
      .slice()
      .reverse()
  );
}
export async function createRecording(body: {
  mode?: unknown;
  title?: unknown;
  teams?: unknown;
  members?: unknown;
  draftVideoId?: unknown;
}) {
  if (body.mode !== "personal" && body.mode !== "team")
    throw new Error("请选择个人或团队记录");
  const raw = body.members;
  if (!Array.isArray(raw) || raw.length > 40) throw new Error("名单格式错误");
  const members = await transaction((db) =>
    raw.map((m) => {
      if (
        !m ||
        !db.players.some((p) => p.id === m.personId && !p.archived) ||
        !["A", "B"].includes(m.team)
      )
        throw new Error("请选择有效球员和队伍");
      return { personId: String(m.personId), team: m.team as "A" | "B" };
    })
  );
  if (new Set(members.map((m) => m.personId)).size !== members.length)
    throw new Error("同一球员不能加入两队");
  if (body.mode === "personal" && members.length !== 1)
    throw new Error("请选择本次记录的球员");
  if (body.draftVideoId !== undefined)
    await transaction((db) => {
      if (
        typeof body.draftVideoId !== "string" ||
        !db.videos.some((v) => v.id === body.draftVideoId && !v.mediaArchived)
      )
        throw new Error("上传视频不可用");
    });
  const names = Array.isArray(body.teams) ? body.teams : [];
  const item: Recording = {
    id: randomUUID(),
    ownerId: currentUser().id,
    mode: body.mode,
    title: title(
      body.title,
      body.mode === "personal" ? "我的精彩记录" : "新的球局"
    ),
    draftVideoId: body.draftVideoId as string | undefined,
    createdAt: new Date().toISOString(),
    teams: [title(names[0], "A队"), title(names[1], "B队")],
    members,
    invite: randomBytes(24).toString("hex"),
  };
  return store((rows) => {
    rows.push(item);
    return item;
  });
}
export async function getRecording(id: string) {
  const owner = currentUser().id;
  const record = await store((rows) =>
    rows.find((r) => r.id === id && r.ownerId === owner)
  );
  if (!record) throw new Error("记录不存在");
  return transaction(async (db) => {
    await synchronize(db);
    const video = db.videos.find((v) => v.id === record.videoId);
    const all = video ? personStatistics(db, video.id) : [];
    const members = record.members.map((m) => {
      const p = db.players.find((p) => p.id === m.personId);
      const s = all.find((p) => p.id === m.personId);
      return {
        ...m,
        name: p?.name || "已移除球员",
        photo: p?.photo || "/assets/player-placeholder.svg",
        jerseyNumber: p?.jerseyNumber,
        made: s?.made || 0,
        knownPoints: s?.knownPoints || 0,
        unknownValue: s?.unknownValue || 0,
      };
    });
    const unmatched =
      video?.result?.events.filter(
        (e) =>
          e.status !== "excluded" &&
          (!e.playerId ||
            !record.members.some(
              (m) => m.personId === video.associations[e.playerId!]
            ))
      ).length || 0;
    const highlights = video ? await highlightState(video.id) : null;
    const files = recordingClips(
      highlights?.result?.clips || [],
      video?.result?.events || [],
      video?.associations || {},
      record.members.map((m) => m.personId)
    );
    const generation = highlights?.result?.generation || "original";
    const signature = createHash("sha256")
      .update(JSON.stringify([generation, files]))
      .digest("hex");
    const selection =
      record.selection?.signature === signature
        ? {
            key: record.selection.key,
            progress: await selectionState(
              video!.id,
              record.selection.key
            ).catch(() => ({
              status: "failed",
              message: "导出不可用，请重试",
            })),
          }
        : null;
    const { result, ...videoInfo } = video || {};
    return {
      record,
      scope: { files, generation, signature, selection },
      members,
      unmatched,
      video: video
        ? { ...videoInfo, eventCount: result?.events.length || 0 }
        : null,
      highlights,
    };
  });
}
export async function attachRecording(id: string, videoId: unknown) {
  if (typeof videoId !== "string") throw new Error("请选择视频");
  await transaction((db) => {
    if (!db.videos.some((v) => v.id === videoId && !v.mediaArchived))
      throw new Error("视频不可用");
  });
  const owner = currentUser().id;
  const record = await store((rows) => {
    const r = rows.find((r) => r.id === id && r.ownerId === owner);
    if (!r) throw new Error("记录不存在");
    if (r.videoId && r.videoId !== videoId)
      throw new Error("此记录已有视频，请新建记录");
    if (
      r.mode === "team" &&
      (!r.members.some((m) => m.team === "A") ||
        !r.members.some((m) => m.team === "B"))
    )
      throw new Error("两队至少各添加一位成员");
    r.videoId = videoId;
    return r;
  });
  const errors: string[] = [];
  try {
    await startAnalysis(videoId);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "分析启动失败");
  }
  try {
    await startHighlights(videoId);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "剪辑启动失败");
  }
  await store((rows) => {
    const r = rows.find((r) => r.id === record.id)!;
    r.launchErrors = errors;
  });
  return { ok: errors.length === 0, errors };
}
export async function updateRecordingMembers(id: string, members: unknown) {
  if (!Array.isArray(members) || members.length > 40)
    throw new Error("名单格式错误");
  const valid = await transaction((db) =>
    members.map((m) => {
      if (
        !m ||
        !db.players.some((p) => p.id === m.personId && !p.archived) ||
        !["A", "B"].includes(m.team)
      )
        throw new Error("名单无效");
      return { personId: String(m.personId), team: m.team as "A" | "B" };
    })
  );
  if (new Set(valid.map((m) => m.personId)).size !== valid.length)
    throw new Error("同一球员不能重复入队");
  const owner = currentUser().id;
  return store((rows) => {
    const r = rows.find((r) => r.id === id && r.ownerId === owner);
    if (!r || r.mode !== "team") throw new Error("球局不存在");
    if (r.videoId) throw new Error("已开始分析，不能修改本场名单");
    r.members = valid.map((m) => ({
      ...m,
      joinedBy: r.members.find((old) => old.personId === m.personId)?.joinedBy,
    }));
    return r;
  });
}
export async function inviteInfo(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) throw new Error("邀请无效");
  return store((rows) => {
    const r = rows.find((r) => r.invite === token && r.mode === "team");
    if (!r) throw new Error("邀请不存在");
    return { title: r.title, teams: r.teams, closed: !!r.videoId };
  });
}
export async function joinRecording(
  token: string,
  personId: unknown,
  team: unknown
) {
  if (!/^[a-f0-9]{48}$/.test(token) || !["A", "B"].includes(String(team)))
    throw new Error("邀请或队伍无效");
  const member = currentUser();
  const source = await transaction((db) =>
    db.players.find((p) => p.id === personId && !p.archived)
  );
  if (!source) throw new Error("请选择自己的球员档案");
  const users = await accounts((db) =>
    db.users.map(({ id, username, role }) => ({ id, username, role }))
  );
  return store(async (rows) => {
    const r = rows.find((r) => r.invite === token && r.mode === "team");
    if (!r || r.videoId) throw new Error("邀请已关闭");
    const owner = users.find((u) => u.id === r.ownerId);
    if (!owner) throw new Error("创建者不存在");

    const joinedBy = member.id + ":" + source.id;
    const existing = r.members.find((m) => m.joinedBy === joinedBy);
    if (existing) {
      existing.team = team as "A" | "B";
      return { ok: true };
    }
    if (r.members.length >= 40) throw new Error("本场名单已满");
    let targetId = source.id;
    if (owner.id !== member.id) {
      targetId = await workspaceContext.run(owner, () =>
        transaction(async (db) => {
          const ref = `record-member:${member.id}:${source.id}`;
          let p = db.players.find((p) => p.sourceRefs?.includes(ref));
          if (!p) {
            p = createProfile(db, {
              name: source.name,
              jerseyNumber: source.jerseyNumber || "",
            });
            p.sourceRefs = [ref];
          }
          const chosen = source.referencePhotos?.find(
            (f) => f.url === source.photo
          );
          if (
            chosen &&
            /^[a-f0-9-]{36}$/.test(chosen.id) &&
            !p.referencePhotos?.length
          ) {
            const photoId = randomUUID(),
              dest = path.join(rootForUser(owner), "player-photos");
            await mkdir(dest, { recursive: true });
            await copyFile(
              path.join(
                rootForUser(member),
                "player-photos",
                chosen.id + ".jpg"
              ),
              path.join(dest, photoId + ".jpg")
            );
            p.photo = `/api/player-photos/${photoId}`;
            p.referencePhotos = [
              {
                id: photoId,
                url: p.photo,
                createdAt: new Date().toISOString(),
              },
            ];
          }
          return p.id;
        })
      );
    }
    const same = r.members.find((m) => m.personId === targetId);
    if (same) {
      same.team = team as "A" | "B";
      same.joinedBy = joinedBy;
    } else
      r.members.push({ personId: targetId, team: team as "A" | "B", joinedBy });
    return { ok: true };
  });
}

export async function exportRecording(id: string, retry = false) {
  const detail = await getRecording(id);
  if (
    !detail.video ||
    detail.video.status !== "complete" ||
    detail.highlights?.progress?.status !== "complete" ||
    !detail.scope.files.length
  )
    throw new Error("还没有已关联的进球片段");
  return store(async (rows) => {
    const record = rows.find(
      (r) => r.id === id && r.ownerId === currentUser().id
    )!;
    if (record.selection?.signature === detail.scope.signature && !retry)
      return record.selection;
    const result = await startSelection(
      detail.video!.id!,
      detail.scope.files,
      detail.scope.generation
    );
    record.selection = { signature: detail.scope.signature, key: result.key };
    return record.selection;
  });
}
