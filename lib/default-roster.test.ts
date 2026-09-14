import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { workspaceContext } from "./workspace-context";
import { transaction } from "./workbench-server";
test("default roster gives each account independent identities and preserves edits on reread", async () => {
  const old = process.env.BASKETBALL_DATA_DIR,
    root = await mkdtemp(path.join(os.tmpdir(), "mt-roster-"));
  process.env.BASKETBALL_DATA_DIR = root;
  try {
    await writeFile(
      path.join(root, "default-roster.json"),
      JSON.stringify([
        { name: "A", jerseyNumber: "0", sourceKey: "sheet:2" },
        { name: "B", jerseyNumber: "0", sourceKey: "sheet:3" },
      ])
    );
    const a = { id: randomUUID(), username: "alice", role: "user" as const },
      b = { id: randomUUID(), username: "bob", role: "user" as const };
    const first = await workspaceContext.run(a, () =>
      transaction((db) => {
        assert.equal(db.players.length, 2);
        db.players[0].name = "Edited";
        db.players[0].archived = true;
        db.players[0].photo = "private-photo";
        return db.players[0].id;
      })
    );
    await workspaceContext.run(a, () =>
      transaction((db) => {
        assert.equal(db.players.length, 2);
        assert.equal(db.players[0].name, "Edited");
        assert.equal(db.players[0].archived, true);
        assert.equal(db.players[0].photo, "private-photo");
      })
    );
    await workspaceContext.run(b, () =>
      transaction((db) => {
        assert.equal(db.players.length, 2);
        assert.notEqual(db.players[0].id, first);
        assert.equal(db.players[0].name, "A");
        assert.equal(db.players[0].jerseyNumber, "0");
        assert.deepEqual(db.players[0].referencePhotos, []);
        assert.equal(db.videos.length, 0);
      })
    );
  } finally {
    if (old === undefined) delete process.env.BASKETBALL_DATA_DIR;
    else process.env.BASKETBALL_DATA_DIR = old;
    await rm(root, { recursive: true, force: true });
  }
});
