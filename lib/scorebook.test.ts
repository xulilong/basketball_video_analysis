import assert from "node:assert/strict";
import { test } from "node:test";
import {
  excludeCandidate,
  mergePlayers,
  removePlayer,
  statistics,
  statsCSV,
} from "./scorebook";
import type { LedgerEvent, Scorebook } from "./scorebook";

const event = (
  id: string,
  kind: LedgerEvent["kind"],
  playerId: string | null = "a",
  confirmed = true
): LedgerEvent => ({ id, kind, playerId, confirmed, timestamp: 2, note: "" });
const fixture = (): Scorebook => ({
  version: 1,
  players: ["a", "b"].map((id) => ({
    id,
    name: id,
    team: id,
    jersey: "23",
    photo: "",
    capturedAt: 0,
  })),
  events: [],
});

test("excluding a warmup or dead-ball candidate removes its score and persists the exclusion", () => {
  const book = fixture();
  book.events = [event("sample-rim-123", "two"), event("valid", "three")];
  const excluded = excludeCandidate(book, "rim-123");
  assert.equal(statistics(excluded)[0].points, 3);
  assert.deepEqual(excluded.excludedCandidates, ["rim-123"]);
  assert.deepEqual(excludeCandidate(excluded, "rim-123").excludedCandidates, [
    "rim-123",
  ]);
});

test("scores, assists and both rebound kinds belong to stable IDs, not identical jerseys", () => {
  const book = fixture();
  book.events = [
    event("1", "one"),
    event("2", "two"),
    event("3", "three"),
    event("4", "assist"),
    event("5", "offRebound"),
    event("6", "defRebound"),
    event("7", "three", "b"),
  ];
  const [a, b] = statistics(book);
  assert.equal(a.points, 6);
  assert.equal(a.assists, 1);
  assert.equal(a.rebounds, 2);
  assert.equal(b.points, 3);
  book.players[0].name = "改名";
  assert.equal(statistics(book)[0].points, 6);
});
test("unconfirmed, unassigned and missing-player events never increase totals", () => {
  const book = fixture();
  book.events = [
    event("1", "three", "a", false),
    event("2", "three", null),
    event("3", "three", "missing"),
  ];
  assert.equal(
    statistics(book).reduce((sum, p) => sum + p.points, 0),
    0
  );
});
test("changing attribution and deleting an event recomputes totals without drift", () => {
  const book = fixture();
  book.events = [event("1", "two")];
  book.events[0].playerId = "b";
  assert.deepEqual(
    statistics(book).map((p) => p.points),
    [0, 2]
  );
  book.events = [];
  assert.deepEqual(
    statistics(book).map((p) => p.points),
    [0, 0]
  );
});
test("merge transfers all events once and rejects invalid targets", () => {
  const book = fixture();
  book.events = [event("1", "two"), event("2", "assist", "b")];
  const merged = mergePlayers(book, "a", "b");
  assert.equal(merged.players.length, 1);
  assert.equal(merged.events.length, 2);
  assert.equal(statistics(merged)[0].points, 2);
  assert.equal(statistics(merged)[0].assists, 1);
  assert.equal(mergePlayers(book, "a", "missing"), book);
});
test("removing a player preserves events as pending for later reassignment", () => {
  const book = fixture();
  book.events = [event("1", "two")];
  const removed = removePlayer(book, "a");
  assert.equal(removed.events[0].playerId, null);
  assert.equal(removed.events[0].confirmed, false);
  assert.equal(removed.events.length, 1);
});
test("CSV quotes names and protects spreadsheet formula cells", () => {
  const book = fixture();
  book.players[0].name = '=HYPERLINK("bad")';
  const csv = statsCSV(book);
  assert.ok(csv.startsWith("\ufeff"));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
});
