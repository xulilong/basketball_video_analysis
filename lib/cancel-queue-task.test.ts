import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { bootstrapAdmin, authenticate } from "./account-server";
import { rootForUser } from "./workspace-context";
import { POST } from "../app/api/admin/queue/route";
test("admin cancellation stops an isolated queued worker, refuses stale runs, and preserves files", async () => {
  const old = process.env.BASKETBALL_DATA_DIR,
    root = await mkdtemp(path.join(os.tmpdir(), "mt-cancel-"));
  process.env.BASKETBALL_DATA_DIR = root;
  let holder: ReturnType<typeof spawn> | undefined,
    child: ReturnType<typeof spawn> | undefined;
  try {
    await bootstrapAdmin("test-admin-password");
    const admin = await authenticate("login", "admin", "test-admin-password"),
      member = await authenticate("register", "member", "test-member-password");
    const lock = path.join(root, "analysis.lock"),
      ready = path.join(root, "ready");
    holder = spawn(
      "python3",
      [
        "-c",
        "import fcntl,time,sys,pathlib; f=open(sys.argv[1],'a'); fcntl.flock(f,fcntl.LOCK_EX); pathlib.Path(sys.argv[2]).touch(); time.sleep(60)",
        lock,
        ready,
      ],
      { stdio: "ignore" }
    );
    for (let i = 0; i < 100; i++) {
      if (
        await readFile(ready)
          .then(() => true)
          .catch(() => false)
      )
        break;
      await new Promise((r) => setTimeout(r, 30));
    }
    const id = "a".repeat(64),
      workspace = rootForUser(member.user),
      dir = path.join(workspace, "videos", id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "source.video"), "preserved source");
    await writeFile(path.join(dir, "result.json"), "preserved result");
    child = spawn(
      "python3",
      [path.join(process.cwd(), "scripts/analyze-upload.py"), "--job-dir", dir],
      {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, BASKETBALL_ANALYSIS_LOCK: lock },
      }
    );
    await new Promise<void>((resolve, reject) => {
      child!.once("spawn", resolve);
      child!.once("error", reject);
    });
    await writeFile(
      path.join(workspace, "database.json"),
      JSON.stringify({
        version: 1,
        players: [],
        videos: [
          {
            id,
            name: "test.mp4",
            size: 1,
            status: "queued",
            pid: child.pid,
            associations: {},
            autoMatched: [],
            createdAt: "",
          },
        ],
      })
    );
    for (let i = 0; i < 100; i++) {
      if (
        await readFile(path.join(dir, "progress.json"))
          .then(() => true)
          .catch(() => false)
      )
        break;
      await new Promise((r) => setTimeout(r, 30));
    }
    const send = (token: string, runId = String(child!.pid)) =>
      POST(
        new Request("http://localhost/api/admin/queue", {
          method: "POST",
          headers: {
            cookie: `mt_session=${token}`,
            origin: "http://localhost",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "cancel",
            id: `${member.user.id}:${id}:analysis:`,
            runId,
          }),
        })
      );
    assert.equal((await send(member.token)).status, 403);
    assert.equal((await send("bad")).status, 401);
    assert.equal((await send(admin.token, "123")).status, 400);
    const r = await send(admin.token);
    assert.equal(r.status, 200, JSON.stringify(await r.json()));
    assert.equal(
      JSON.parse(await readFile(path.join(dir, "progress.json"), "utf8"))
        .status,
      "cancelled"
    );
    assert.equal(
      JSON.parse(await readFile(path.join(workspace, "database.json"), "utf8"))
        .videos[0].status,
      "cancelled"
    );
    assert.equal(
      await readFile(path.join(dir, "source.video"), "utf8"),
      "preserved source"
    );
    assert.equal(
      await readFile(path.join(dir, "result.json"), "utf8"),
      "preserved result"
    );
    assert.doesNotThrow(() => process.kill(holder!.pid!, 0));
    assert.equal((await send(admin.token)).status, 200);
  } finally {
    if (child?.pid)
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    holder?.kill("SIGTERM");
    if (old === undefined) delete process.env.BASKETBALL_DATA_DIR;
    else process.env.BASKETBALL_DATA_DIR = old;
    await rm(root, { recursive: true, force: true });
  }
});
