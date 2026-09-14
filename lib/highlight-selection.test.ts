import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import {
  selectClips,
  startSelection,
  selectionState,
  selectionDirectory,
} from "./highlight-selection";
import { highlightDirectory } from "./highlight-server";
import { transaction, jobDirectory } from "./workbench-server";
import { workspaceContext } from "./workspace-context";
import { authenticate, bootstrapAdmin } from "./account-server";
import { GET as media } from "../app/api/videos/[id]/highlights/media/route";
const run = promisify(execFile);
test("selection validates IDs and follows original video order", () => {
  const clips = [
    { file: "a", start: 0, end: 1 },
    { file: "b", start: 2, end: 3 },
  ];
  assert.deepEqual(selectClips(clips, ["b", "a"]), clips);
  for (const files of [[], ["a", "a"], ["../source"], [1], null])
    assert.throws(() => selectClips(clips, files));
});
test("selected export renders only requested ranges and remains account-private", async () => {
  const old = process.env.BASKETBALL_DATA_DIR,
    root = await mkdtemp(path.join(os.tmpdir(), "mt-selection-"));
  process.env.BASKETBALL_DATA_DIR = root;
  try {
    await bootstrapAdmin("test-admin-password");
    const a = await authenticate("register", "alice", "test-password"),
      b = await authenticate("register", "bob", "test-password");
    const id = "a".repeat(64),
      generation = "b".repeat(32);
    await workspaceContext.run(a.user, async () => {
      const dir = jobDirectory(id);
      await mkdir(dir, { recursive: true });
      await run("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=160x120:rate=30:duration=6",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=6",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-f",
        "mp4",
        path.join(dir, "source.video"),
      ]);
      await transaction((db) => {
        db.videos.push({
          id,
          name: "test.mp4",
          size: 1,
          createdAt: new Date().toISOString(),
          status: "uploaded",
          associations: {},
          autoMatched: [],
        });
      });
      await mkdir(highlightDirectory(id), { recursive: true });
      const clips = [0, 2, 4].map((start, i) => ({
        start,
        end: start + 1,
        file: `clip-00${i + 1}.mp4`,
        baskets: [start + 0.5],
      }));
      await writeFile(
        path.join(highlightDirectory(id), "result.json"),
        JSON.stringify({
          generation,
          clips,
          options: { musicId: "preset-drive" },
        })
      );
      await assert.rejects(startSelection(id, [clips[0].file], "old"));
      const { key } = await startSelection(
        id,
        [clips[2].file, clips[0].file],
        generation
      );
      let state;
      for (let i = 0; i < 120; i++) {
        state = await selectionState(id, key);
        if (state.status !== "running") break;
        await new Promise((r) => setTimeout(r, 250));
      }
      assert.equal(state.status, "complete", JSON.stringify(state));
      const probe = await run("ffmpeg", [
        "-hide_banner",
        "-i",
        path.join(selectionDirectory(id, key), "highlights.mp4"),
        "-f",
        "null",
        "-",
      ]);
      const duration = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe.stderr);
      assert.ok(duration);
      const seconds =
        Number(duration[1]) * 3600 +
        Number(duration[2]) * 60 +
        Number(duration[3]);
      assert.ok(Math.abs(seconds - 2) < 0.3);
      assert.match(probe.stderr, /Audio: aac/);
      const request = (token: string) =>
        new Request(
          `http://localhost/api/videos/${id}/highlights/media?selection=${key}&download=1`,
          { headers: { cookie: `mt_session=${token}` } }
        );
      const context = () => ({ params: Promise.resolve({ id }) });
      assert.equal((await media(request(b.token), context())).status, 404);
      const response = await media(request(a.token), context());
      assert.equal(response.status, 200);
      assert.ok((await response.arrayBuffer()).byteLength > 1000);
    });
  } finally {
    if (old === undefined) delete process.env.BASKETBALL_DATA_DIR;
    else process.env.BASKETBALL_DATA_DIR = old;
    await rm(root, { recursive: true, force: true });
  }
});
