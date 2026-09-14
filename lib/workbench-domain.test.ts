import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyWorkbench,
  importAnalysis,
  personStatistics,
  mergePeople,
  relinkPerson,
  replaceAnalysis,
} from "./workbench-domain";
import type { VideoAnalysis, VideoJob } from "./workbench-types";
const job = (id: string): VideoJob => ({
  id,
  name: id,
  size: 1,
  createdAt: "",
  status: "running",
  associations: {},
  autoMatched: [],
});
const result = (id: string, descriptor = [1, 0]): VideoAnalysis => ({
  version: 1,
  videoKey: id,
  duration: 20,
  analyzedSeconds: 20,
  elapsedSeconds: 1,
  warnings: [],
  hoop: null,
  players: [
    {
      id: "p1",
      photo: "data:image/jpeg;base64,",
      descriptor,
      observations: 10,
      first: 0,
      last: 20,
    },
  ],
  events: [
    {
      id: "e1",
      timestamp: 10,
      playerId: "p1",
      points: 2,
      status: "estimated",
      reason: "",
    },
  ],
});
test("same player accumulates across distinct videos; repeated import does not double count", () => {
  const db = emptyWorkbench(),
    a = job("a"),
    b = job("b");
  db.videos.push(a, b);
  importAnalysis(db, a, result("a"));
  importAnalysis(db, a, result("a"));
  importAnalysis(db, b, result("b"));
  assert.equal(db.players.length, 1);
  assert.equal(personStatistics(db)[0].pointsMin, 4);
  assert.equal(personStatistics(db)[0].videos, 2);
  assert.equal(personStatistics(db, "a")[0].pointsMin, 2);
});
test("ambiguous identities and simultaneous people are kept separate", () => {
  const db = emptyWorkbench(),
    a = job("a");
  db.videos.push(a);
  const r = result("a");
  r.players.push({ ...r.players[0], id: "p2" });
  importAnalysis(db, a, r);
  assert.equal(db.players.length, 2);
  const b = job("b");
  db.videos.push(b);
  importAnalysis(db, b, result("b"));
  assert.equal(db.players.length, 3);
});
test("excluded, unresolved and unassigned events never enter cumulative points", () => {
  const db = emptyWorkbench(),
    a = job("a");
  db.videos.push(a);
  const r = result("a");
  r.events.push(
    { ...r.events[0], id: "x", status: "excluded" },
    { ...r.events[0], id: "u", status: "unresolved" },
    { ...r.events[0], id: "n", playerId: null },
    { ...r.events[0], id: "v", points: null }
  );
  importAnalysis(db, a, r);
  const p = personStatistics(db)[0];
  assert.equal(p.made, 2);
  assert.deepEqual([p.pointsMin, p.pointsMax], [2, 2]);
  assert.equal(p.unknownValue, 1);
});
test("merge and correction recompute all historical totals without drift", () => {
  const db = emptyWorkbench(),
    a = job("a"),
    b = job("b");
  db.videos.push(a, b);
  importAnalysis(db, a, result("a"));
  importAnalysis(db, b, result("b", [0, 1]));
  const [one, two] = db.players;
  relinkPerson(db, "b", "p1", one.id);
  assert.equal(personStatistics(db).find((p) => p.id === one.id)!.pointsMin, 4);
  relinkPerson(db, "b", "p1", two.id);
  mergePeople(db, two.id, one.id);
  assert.equal(db.players.length, 1);
  assert.equal(personStatistics(db)[0].pointsMin, 4);
});
test("mismatched source result cannot be imported", () => {
  const db = emptyWorkbench();
  assert.throws(() => importAnalysis(db, job("a"), result("b")));
});

test("reanalysis replaces obsolete fragments without double counting or removing named people", () => {
  const db = emptyWorkbench(),
    a = job("a");
  db.videos.push(a);
  importAnalysis(db, a, result("a"));
  const prior = db.players[0];
  prior.name = "Named player";
  const next = result("a");
  next.events[0].points = 3;
  replaceAnalysis(db, a, next);
  assert.equal(db.players.length, 1);
  assert.equal(db.players[0].id, prior.id);
  assert.equal(personStatistics(db)[0].knownPoints, 3);
  assert.throws(() => replaceAnalysis(db, a, result("other")));
  assert.equal(personStatistics(db)[0].knownPoints, 3);
});

test("reanalysis prunes obsolete automatic fragments and keeps old totals while running", () => {
  const db = emptyWorkbench(),
    a = job("a");
  db.videos.push(a);
  importAnalysis(db, a, result("a"));
  a.status = "running";
  assert.equal(personStatistics(db)[0].knownPoints, 2);
  const next = result("a", [0, 1]);
  replaceAnalysis(db, a, next);
  assert.equal(db.players.length, 1);
  assert.equal(personStatistics(db)[0].knownPoints, 2);
});
