import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  mkdir,
  access,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { bootstrapAdmin, authenticate, workspaceRoute } from "./account-server";
import { workspaceContext, rootForUser } from "./workspace-context";
import { commitVideo, transaction, jobDirectory } from "./workbench-server";
import { createProfile } from "./player-profiles";
import { GET as getMedia } from "../app/api/videos/[id]/media/route";
import {
  GET as adminGet,
  POST as adminPost,
} from "../app/api/admin/board/route";
import { GET as boardGet } from "../app/api/board/route";
import { prepareArchive, releaseArchive } from "./archive-server";
import {
  beginUpload,
  putChunk,
  finishUpload,
  chunkSize,
} from "./upload-chunks";

test("private workspaces, publication and browser-confirmed cleanup enforce account boundaries", async () => {
  const old = process.env.BASKETBALL_DATA_DIR,
    root = await mkdtemp(path.join(os.tmpdir(), "mt-isolation-"));
  process.env.BASKETBALL_DATA_DIR = root;
  try {
    await bootstrapAdmin("admin-test-password");
    const admin = await authenticate("login", "admin", "admin-test-password"),
      a = await authenticate("register", "alice", "test-password"),
      b = await authenticate("register", "bob", "test-password");
    const req = (
      token: string,
      url = "http://localhost:3001/api/workbench",
      body?: unknown
    ) =>
      new Request(url, {
        headers: {
          cookie: `mt_session=${token}`,
          ...(body
            ? {
                "Content-Type": "application/json",
                origin: "http://localhost:3001",
              }
            : {}),
        },
        ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
      });
    const privateGet = workspaceRoute(async () =>
      Response.json(await transaction((db) => db))
    );
    assert.equal((await privateGet(req("forged"))).status, 401);
    const bytes = Buffer.from("source-video-fixture"),
      id = createHash("sha256").update(bytes).digest("hex");
    await workspaceContext.run(a.user, async () => {
      const file = path.join(root, "upload");
      await writeFile(file, bytes);
      await commitVideo(file, "a.mp4", bytes.length, id);
      await transaction((db) => {
        db.videos[0].status = "complete";
        createProfile(db, { name: "Alice player", jerseyNumber: "7" });
      });
    });
    assert.equal(
      (await (await privateGet(req(a.token))).json()).videos.length,
      1
    );
    assert.equal(
      (await (await privateGet(req(b.token))).json()).videos.length,
      0
    );
    const media = () => ({ params: Promise.resolve({ id }) });
    assert.equal((await getMedia(req(b.token), media())).status, 404);
    assert.equal((await getMedia(req(a.token), media())).status, 200);
    assert.equal(
      (await adminGet(req(a.token, "http://localhost:3001/api/admin/board")))
        .status,
      403
    );
    assert.equal(
      (
        await adminPost(
          req(a.token, "http://localhost:3001/api/admin/board", {
            action: "publish",
          })
        )
      ).status,
      403
    );
    assert.deepEqual(await (await boardGet()).json(), []);
    const person = await workspaceContext.run(a.user, () =>
      transaction((db) => db.players[0])
    );
    const publish = {
      action: "publish",
      userId: a.user.id,
      personId: person.id,
      knownPoints: 999,
    };
    for (let n = 0; n < 2; n++)
      assert.equal(
        (
          await adminPost(
            req(admin.token, "http://localhost:3001/api/admin/board", publish)
          )
        ).status,
        200
      );
    const publicRows = await (await boardGet()).json();
    assert.equal(publicRows.length, 1);
    assert.equal(publicRows[0].knownPoints, 0);
    for (const field of [
      "sourceUserId",
      "sourcePersonId",
      "photo",
      "descriptors",
      "username",
    ])
      assert.equal(publicRows[0][field], undefined);
    await adminPost(
      req(admin.token, "http://localhost:3001/api/admin/board", {
        action: "unpublish",
        id: publicRows[0].id,
      })
    );
    assert.deepEqual(await (await boardGet()).json(), []);
    const plan = await workspaceContext.run(a.user, () => prepareArchive(id));
    await assert.rejects(
      workspaceContext.run(b.user, () =>
        releaseArchive(
          id,
          plan.id,
          plan.files.map((f) => f.sha256)
        )
      )
    );
    await assert.rejects(
      workspaceContext.run(a.user, () =>
        releaseArchive(id, plan.id, ["bad-checksum"])
      )
    );
    await access(path.join(rootForUser(a.user), "videos", id, "source.video"));
    await workspaceContext.run(a.user, () =>
      releaseArchive(
        id,
        plan.id,
        plan.files.map((f) => f.sha256)
      )
    );
    await assert.rejects(
      access(path.join(rootForUser(a.user), "videos", id, "source.video"))
    );
    assert.equal(
      (
        await workspaceContext.run(a.user, () =>
          transaction((db) => db.videos[0])
        )
      ).mediaArchived,
      true
    );
    // Retrying a successful receipt is safe, and restored media cannot be removed by an old receipt.
    await workspaceContext.run(a.user, () =>
      releaseArchive(
        id,
        plan.id,
        plan.files.map((f) => f.sha256)
      )
    );
    await workspaceContext.run(a.user, async () => {
      const file = path.join(root, "restore");
      await writeFile(file, bytes);
      await commitVideo(file, "a.mp4", bytes.length, id);
    });
    await assert.rejects(
      workspaceContext.run(a.user, () =>
        releaseArchive(
          id,
          plan.id,
          plan.files.map((f) => f.sha256)
        )
      )
    );
    await access(path.join(rootForUser(a.user), "videos", id, "source.video"));
  } finally {
    if (old === undefined) delete process.env.BASKETBALL_DATA_DIR;
    else process.env.BASKETBALL_DATA_DIR = old;
    await rm(root, { recursive: true, force: true });
  }
});

test("chunk uploads are validated, isolated and deduplicated after assembly", async () => {
  const old = process.env.BASKETBALL_DATA_DIR,
    root = await mkdtemp(path.join(os.tmpdir(), "mt-chunks-"));
  process.env.BASKETBALL_DATA_DIR = root;
  const a = {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      username: "a",
      role: "user" as const,
    },
    b = {
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      username: "b",
      role: "user" as const,
    };
  try {
    const bytes = Buffer.alloc(chunkSize + 31, 3);
    const upload = await workspaceContext.run(a, () =>
      beginUpload("movie.mp4", bytes.length)
    );
    const request = (body: Buffer) =>
      new Request("http://localhost/upload", {
        method: "PUT",
        headers: {
          "x-chunk-sha256": createHash("sha256").update(body).digest("hex"),
        },
        body: new Uint8Array(body).buffer,
      });
    await assert.rejects(
      workspaceContext.run(b, () =>
        putChunk(upload.id, 0, request(bytes.subarray(0, chunkSize)))
      )
    );
    await assert.rejects(
      workspaceContext.run(a, () =>
        putChunk(upload.id, 0, request(Buffer.from("short")))
      )
    );
    await workspaceContext.run(a, () =>
      putChunk(upload.id, 1, request(bytes.subarray(chunkSize)))
    );
    await assert.rejects(
      workspaceContext.run(a, () => finishUpload(upload.id))
    );
    await workspaceContext.run(a, () =>
      putChunk(upload.id, 0, request(bytes.subarray(0, chunkSize)))
    );
    const result = await workspaceContext.run(a, () => finishUpload(upload.id));
    assert.equal(
      result.video.id,
      createHash("sha256").update(bytes).digest("hex")
    );
    assert.deepEqual(
      await workspaceContext.run(a, () =>
        readFile(path.join(jobDirectory(result.video.id), "source.video"))
      ),
      bytes
    );
  } finally {
    if (old === undefined) delete process.env.BASKETBALL_DATA_DIR;
    else process.env.BASKETBALL_DATA_DIR = old;
    await rm(root, { recursive: true, force: true });
  }
});
