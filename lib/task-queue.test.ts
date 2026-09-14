import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { authenticate, bootstrapAdmin } from "./account-server";
import { rootForUser } from "./workspace-context";
import { GET } from "../app/api/admin/queue/route";
test("queue is admin-only, covers private workspaces and detects exited workers without rewriting data", async () => {
  const old = process.env.BASKETBALL_DATA_DIR,
    root = await mkdtemp(path.join(os.tmpdir(), "mt-queue-"));
  process.env.BASKETBALL_DATA_DIR = root;
  try {
    await bootstrapAdmin("test-admin-password");
    const admin = await authenticate("login", "admin", "test-admin-password"),
      member = await authenticate("register", "member", "test-member-password");
    const workspace = rootForUser(member.user);
    await mkdir(workspace, { recursive: true });
    const id = "a".repeat(64),
      second = "b".repeat(64),
      base = {
        name: "private.mp4",
        size: 1,
        createdAt: new Date().toISOString(),
        status: "queued",
        associations: {},
        autoMatched: [],
      };
    const file = path.join(workspace, "database.json");
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        players: [],
        videos: [
          { ...base, id, pid: process.pid },
          { ...base, id: second, pid: 99999999 },
        ],
      })
    );
    const before = await readFile(file, "utf8");
    const dir = path.join(workspace, "highlights/videos", id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "worker.pid"), String(process.pid));
    await writeFile(
      path.join(dir, "progress.json"),
      JSON.stringify({
        status: "running",
        percent: 73.8,
        message: "检查篮筐",
        elapsedSeconds: 10,
      })
    );
    const req = (token: string) =>
      new Request("http://localhost/api/admin/queue", {
        headers: { cookie: `mt_session=${token}` },
      });
    assert.equal((await GET(req("bad"))).status, 401);
    assert.equal((await GET(req(member.token))).status, 403);
    const response = await GET(req(admin.token));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.counts, { running: 1, queued: 1 });
    assert.equal(data.active[0].username, "member");
    assert.equal(data.active[0].percent, 73.8);
    assert.equal(data.recent[0].status, "failed");
    assert.match(data.recent[0].message, /已退出/);
    assert.equal(await readFile(file, "utf8"), before);
    assert.ok(!JSON.stringify(data).includes("passwordHash"));
    assert.ok(!JSON.stringify(data).includes(root));
  } finally {
    if (old === undefined) delete process.env.BASKETBALL_DATA_DIR;
    else process.env.BASKETBALL_DATA_DIR = old;
    await rm(root, { recursive: true, force: true });
  }
});
