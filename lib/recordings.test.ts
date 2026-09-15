import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bootstrapAdmin, authenticate } from "./account-server";
import { workspaceContext } from "./workspace-context";
import { transaction } from "./workbench-server";
import { createProfile } from "./player-profiles";
import {
  createRecording,
  listRecordings,
  getRecording,
  joinRecording,
  inviteInfo,
  updateRecordingMembers,
  attachRecording,
} from "./recordings";
import { recordingClips } from "./recording-clips";

test("recording invitations copy only selected identity, isolate owners, and avoid duplicate membership", async () => {
  const previous = process.env.BASKETBALL_DATA_DIR;
  const root = await mkdtemp(path.join(os.tmpdir(), "mt-record-"));
  process.env.BASKETBALL_DATA_DIR = root;
  try {
    await bootstrapAdmin("test-password-admin");
    const a = (await authenticate("register", "owner_a", "test-password")).user;
    const b = (await authenticate("register", "member_b", "test-password"))
      .user;
    const asA = <T>(fn: () => Promise<T>) => workspaceContext.run(a, fn);
    const asB = <T>(fn: () => Promise<T>) => workspaceContext.run(b, fn);
    const p = await asA(() =>
      transaction((db) =>
        createProfile(db, { name: "队长", jerseyNumber: "3" })
      )
    );
    const q = await asB(() =>
      transaction((db) =>
        createProfile(db, { name: "队员", jerseyNumber: "8" })
      )
    );
    const record = await asA(() =>
      createRecording({
        mode: "team",
        members: [{ personId: p.id, team: "A" }],
      })
    );
    assert.deepEqual(await asB(() => listRecordings()), []);
    await assert.rejects(
      asB(() => getRecording(record.id)),
      /不存在/
    );
    await assert.rejects(
      asB(() => updateRecordingMembers(record.id, [])),
      /不存在/
    );
    assert.deepEqual(
      Object.keys(await asB(() => inviteInfo(record.invite))).sort(),
      ["closed", "teams", "title"]
    );
    await assert.rejects(
      asB(() => joinRecording(record.invite, p.id, "B")),
      /自己的/
    );
    await asB(() => joinRecording(record.invite, q.id, "B"));
    await asB(() => joinRecording(record.invite, q.id, "B"));
    let d = await asA(() => getRecording(record.id));
    assert.equal(d.members.length, 2);
    assert.equal(d.members[1].name, "队员");
    assert.notEqual(d.members[1].personId, q.id);
    assert.equal(await asB(() => transaction((db) => db.players.length)), 1);
    await asA(() => updateRecordingMembers(record.id, d.record.members));
    await asB(() => joinRecording(record.invite, q.id, "A"));
    d = await asA(() => getRecording(record.id));
    assert.equal(d.members.length, 2);
    assert.equal(d.members[1].team, "A");
    await assert.rejects(
      asA(() => createRecording({ mode: "personal", members: [] })),
      /请选择/
    );
    await assert.rejects(
      asA(() =>
        createRecording({
          mode: "personal",
          members: [{ personId: p.id, team: "A" }],
          draftVideoId: "foreign",
        })
      ),
      /不可用/
    );
    await assert.rejects(
      asA(() => attachRecording(record.id, "foreign")),
      /不可用/
    );
    await assert.rejects(
      asA(() =>
        updateRecordingMembers(record.id, [
          { personId: p.id, team: "A" },
          { personId: p.id, team: "B" },
        ])
      ),
      /重复/
    );
  } finally {
    if (previous === undefined) delete process.env.BASKETBALL_DATA_DIR;
    else process.env.BASKETBALL_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
test("personal clips exclude unknown, excluded, ambiguous and mixed-player baskets", () => {
  const events = [
    {
      id: "1",
      timestamp: 10,
      playerId: "a",
      points: 2 as const,
      status: "estimated" as const,
      reason: "",
    },
    {
      id: "2",
      timestamp: 20,
      playerId: "b",
      points: 3 as const,
      status: "estimated" as const,
      reason: "",
    },
    {
      id: "3",
      timestamp: 30,
      playerId: "a",
      points: null,
      status: "excluded" as const,
      reason: "",
    },
  ];
  const clips = [
    { file: "personal", baskets: [10] },
    { file: "mixed", baskets: [10, 20] },
    { file: "other", baskets: [20] },
    { file: "excluded", baskets: [30] },
    { file: "unknown", baskets: [40] },
  ];
  assert.deepEqual(
    recordingClips(clips, events, { a: "me", b: "other" }, ["me"]),
    ["personal"]
  );
  assert.deepEqual(
    recordingClips(
      clips,
      [...events, { ...events[0], id: "4", timestamp: 10.5 }],
      { a: "me" },
      ["me"]
    ),
    []
  );
  assert.deepEqual(
    recordingClips(clips, events, { a: "me", b: "other" }, ["me", "other"]),
    ["personal", "mixed", "other"]
  );
});

test("recording resumes an upload, sums matched scores and renders only member highlights", async () => {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { promisify } = await import("node:util");
  const { execFile } = await import("node:child_process");
  const { jobDirectory } = await import("./workbench-server");
  const { highlightDirectory } = await import("./highlight-server");
  const { selectionDirectory } = await import("./highlight-selection");
  const { exportRecording } = await import("./recordings");
  const old = process.env.BASKETBALL_DATA_DIR,
    root = await mkdtemp(path.join(os.tmpdir(), "mt-record-export-"));
  process.env.BASKETBALL_DATA_DIR = root;
  try {
    await bootstrapAdmin("test-admin-password");
    const a = await authenticate("register", "recorder", "test-password");
    await workspaceContext.run(a.user, async () => {
      const id = "c".repeat(64),
        dir = jobDirectory(id);
      await mkdir(dir, { recursive: true });
      const run = promisify(execFile);
      await run("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=160x120:rate=30:duration=6",
        "-c:v",
        "libx264",
        "-f",
        "mp4",
        path.join(dir, "source.video"),
      ]);
      const p = await transaction((db) =>
        createProfile(db, { name: "本人", jerseyNumber: "7" })
      );
      await transaction((db) =>
        db.videos.push({
          id,
          name: "fixture.mp4",
          size: 1000,
          status: "complete",
          createdAt: new Date().toISOString(),
          associations: { a: p.id },
          autoMatched: [],
          result: {
            version: 1,
            videoKey: id,
            duration: 6,
            analyzedSeconds: 6,
            elapsedSeconds: 1,
            players: [],
            hoop: null,
            warnings: [],
            events: [
              {
                id: "1",
                timestamp: 1,
                playerId: "a",
                points: 3,
                status: "estimated",
                reason: "",
              },
              {
                id: "2",
                timestamp: 4,
                playerId: null,
                points: null,
                status: "unresolved",
                reason: "",
              },
            ],
          },
        })
      );
      await mkdir(highlightDirectory(id), { recursive: true });
      await writeFile(
        path.join(highlightDirectory(id), "progress.json"),
        JSON.stringify({ status: "complete" })
      );
      await writeFile(
        path.join(highlightDirectory(id), "result.json"),
        JSON.stringify({
          generation: "v1",
          clips: [
            { file: "clip-001.mp4", start: 0, end: 2, baskets: [1] },
            { file: "clip-002.mp4", start: 3, end: 5, baskets: [4] },
          ],
        })
      );
      const r = await createRecording({
        mode: "personal",
        members: [{ personId: p.id, team: "A" }],
        draftVideoId: id,
      });
      assert.equal((await getRecording(r.id)).record.draftVideoId, id);
      assert.deepEqual(await attachRecording(r.id, id), {
        ok: true,
        errors: [],
      });
      let d = await getRecording(r.id);
      assert.equal(d.members[0].knownPoints, 3);
      assert.equal(d.members[0].made, 1);
      assert.equal(d.unmatched, 1);
      assert.deepEqual(d.scope.files, ["clip-001.mp4"]);
      const selection = await exportRecording(r.id);
      assert.deepEqual(await exportRecording(r.id), selection);
      for (let i = 0; i < 120; i++) {
        d = await getRecording(r.id);
        if (d.scope.selection?.progress.status !== "running") break;
        await new Promise((r) => setTimeout(r, 250));
      }
      assert.equal(d.scope.selection?.progress.status, "complete");
      const probe = await run("ffmpeg", [
        "-hide_banner",
        "-i",
        path.join(selectionDirectory(id, selection.key), "highlights.mp4"),
        "-f",
        "null",
        "-",
      ]);
      assert.match(probe.stderr, /Duration: 00:00:02/);
    });
  } finally {
    if (old === undefined) delete process.env.BASKETBALL_DATA_DIR;
    else process.env.BASKETBALL_DATA_DIR = old;
    await rm(root, { recursive: true, force: true });
  }
});
