import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bootstrapAdmin, authenticate } from "./account-server";
import { workspaceContext } from "./workspace-context";
import { transaction } from "./workbench-server";
import { POST } from "../app/api/admin/board/route";
import { GET } from "../app/api/board/route";
test("video publishing is admin-only, idempotent, replaces identities and adds unique video scores", async () => {
  const old = process.env.BASKETBALL_DATA_DIR,
    root = await mkdtemp(path.join(os.tmpdir(), "mt-publish-"));
  process.env.BASKETBALL_DATA_DIR = root;
  try {
    await bootstrapAdmin("test-admin-password");
    const admin = await authenticate("login", "admin", "test-admin-password"),
      member = await authenticate("register", "member", "test-member-password");
    const send = (token: string, videoId: string, action = "publish-video") =>
      POST(
        new Request("http://localhost:3001/api/admin/board", {
          method: "POST",
          headers: {
            cookie: `mt_session=${token}`,
            origin: "http://localhost:3001",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action, videoId, knownPoints: 999 }),
        })
      );
    const ids = ["a".repeat(64), "b".repeat(64)];
    await workspaceContext.run(admin.user, () =>
      transaction((db) => {
        db.players = [
          {
            id: "one",
            name: "Test player",
            photo: "private-photo",
            descriptors: [],
            createdAt: new Date().toISOString(),
          },
          {
            id: "two",
            name: "Test player",
            photo: "private-photo",
            descriptors: [],
            createdAt: new Date().toISOString(),
          },
        ];
        db.videos = ids.map((id, i) => ({
          id,
          name: "private.mp4",
          size: 1,
          createdAt: new Date().toISOString(),
          status: "complete",
          associations: { local: "one" },
          autoMatched: [],
          result: {
            version: 1,
            videoKey: id,
            duration: 10,
            analyzedSeconds: 10,
            elapsedSeconds: 1,
            players: [],
            hoop: null,
            warnings: [],
            events: [
              {
                id: "goal",
                timestamp: 2,
                playerId: "local",
                points: i === 0 ? 3 : 2,
                status: "estimated",
                reason: "",
              },
            ],
          },
        }));
      })
    );
    assert.equal((await send(member.token, ids[0])).status, 403);
    assert.equal((await send("invalid", ids[0])).status, 401);
    assert.equal((await send(admin.token, "c".repeat(64))).status, 400);
    assert.equal(
      (await send(admin.token, ids[0], "preview-video")).status,
      200
    );
    assert.deepEqual(await (await GET()).json(), []);
    for (const id of [ids[0], ids[0], ids[1]])
      assert.equal((await send(admin.token, id)).status, 200);
    let rows = await (await GET()).json();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].knownPoints, 5);
    assert.equal(rows[0].videos, 2);
    for (const field of [
      "sourceVideoId",
      "sourceUserId",
      "sourcePersonId",
      "photo",
    ])
      assert.equal(rows[0][field], undefined);
    await workspaceContext.run(admin.user, () =>
      transaction((db) => {
        db.videos[0].associations.local = "two";
      })
    );
    assert.equal((await send(admin.token, ids[0])).status, 200);
    rows = await (await GET()).json();
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((r: { knownPoints: number }) => r.knownPoints).sort(),
      [2, 3]
    );
  } finally {
    if (old === undefined) delete process.env.BASKETBALL_DATA_DIR;
    else process.env.BASKETBALL_DATA_DIR = old;
    await rm(root, { recursive: true, force: true });
  }
});
