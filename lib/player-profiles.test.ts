import test from "node:test";
import assert from "node:assert/strict";
import { createProfile, importRoster, profileFields } from "./player-profiles";
import {
  emptyWorkbench,
  mergePeople,
  importAnalysis,
} from "./workbench-domain";
test("duplicate jerseys are independent and zero is preserved", () => {
  const db = emptyWorkbench();
  const a = createProfile(db, { name: "A", jerseyNumber: "0" }),
    b = createProfile(db, { name: "B", jerseyNumber: "0" });
  assert.notEqual(a.id, b.id);
  assert.equal(a.jerseyNumber, "0");
  assert.deepEqual(a.descriptors, []);
});
test("imports remain idempotent after merging source profiles", () => {
  const db = emptyWorkbench(),
    rows = [
      { name: "A", jerseyNumber: "1", sourceKey: "sheet:2" },
      { name: "B", jerseyNumber: "1", sourceKey: "sheet:3" },
    ];
  assert.equal(importRoster(db, rows).created, 2);
  const a = db.players[0],
    b = db.players[1];
  a.referencePhotos = [{ id: "photo", url: "/photo", createdAt: "" }];
  mergePeople(db, a.id, b.id);
  assert.equal(importRoster(db, rows).skipped, 2);
  assert.equal(b.referencePhotos?.[0].url, "/photo");
  assert.equal(b.photo, "/photo");
});
test("archived identities cannot be automatically assigned", () => {
  const db = emptyWorkbench();
  const p = createProfile(db, { name: "A" });
  p.archived = true;
  p.descriptors = [[1, 2]];
  const job = {
    id: "v",
    name: "v",
    size: 1,
    createdAt: "",
    status: "uploaded" as const,
    associations: {},
    autoMatched: [],
  };
  db.videos.push(job);
  importAnalysis(db, job, {
    version: 1,
    videoKey: "v",
    duration: 1,
    analyzedSeconds: 1,
    elapsedSeconds: 1,
    players: [
      {
        id: "local",
        photo: "/pic",
        descriptor: [1, 2],
        observations: 1,
        first: 0,
        last: 1,
      },
    ],
    events: [],
    warnings: [],
    hoop: null,
  });
  assert.notEqual(db.videos[0].associations.local, p.id);
});
test("invalid fields are rejected", () => {
  for (const value of [
    { name: "" },
    { name: "A", jerseyNumber: "-1" },
    { name: "A", jerseyNumber: "1234" },
    { name: "A", jerseyNumber: 0 },
  ])
    assert.throws(() => profileFields(value));
});
