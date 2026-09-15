import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { authenticate, bootstrapAdmin } from "./account-server";
import { GET as bootstrap } from "../app/api/mobile/bootstrap/route";
import { GET, POST } from "../app/api/me/profile/route";
import { workspaceContext } from "./workspace-context";
import { transaction } from "./workbench-server";

test("personal profile follows the account and cannot select a different user profile", async () => {
  const before = process.env.BASKETBALL_DATA_DIR;
  const root = await mkdtemp(path.join(os.tmpdir(), "court-profile-"));
  process.env.BASKETBALL_DATA_DIR = root;
  try {
    await bootstrapAdmin("private-test-admin");
    const a = await authenticate("register", "alice", "test-password"),
      b = await authenticate("register", "bob", "test-password");
    const request = (token: string, body?: unknown) =>
      new Request("http://localhost/api/me/profile", {
        headers: {
          cookie: `mt_session=${token}`,
          origin: "http://localhost",
          "Content-Type": "application/json",
        },
        ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
      });
    assert.equal((await GET(request("forged"))).status, 401);
    assert.deepEqual(await (await GET(request(a.token))).json(), {
      profile: null,
    });
    const p = await (
      await POST(request(a.token, { name: "Alice", jerseyNumber: "7" }))
    ).json();
    assert.ok(p.id);
    const second = await (
      await POST(request(a.token, { name: "Alice B", jerseyNumber: "8" }))
    ).json();
    assert.equal(second.id, p.id);
    assert.equal(
      await workspaceContext.run(a.user, () =>
        transaction((db) => db.players.length)
      ),
      1
    );
    const signedAgain = await authenticate("login", "alice", "test-password");
    const restored = await (await GET(request(signedAgain.token))).json();
    const boot = await (await bootstrap(request(signedAgain.token))).json();
    assert.equal(boot.user.id, a.user.id);
    assert.equal(boot.profile.id, p.id);
    assert.equal(boot.players.length, 1);
    assert.equal(boot.players[0].descriptors, undefined);
    assert.deepEqual((await (await bootstrap(request(b.token))).json()).players, []);
    assert.deepEqual(await (await bootstrap(request("forged"))).json(), { user: null });
    assert.equal(restored.profile.id, p.id);
    assert.equal(restored.profile.name, "Alice B");
    assert.equal(restored.profile.descriptors, undefined);
    assert.equal(
      (await POST(request(b.token, { personId: p.id }))).status,
      400
    );
    assert.deepEqual(await (await GET(request(b.token))).json(), {
      profile: null,
    });
  } finally {
    if (before === undefined) delete process.env.BASKETBALL_DATA_DIR;
    else process.env.BASKETBALL_DATA_DIR = before;
    await rm(root, { recursive: true, force: true });
  }
});
