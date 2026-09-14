// Input: a complete `lark-cli base +record-list --format json` envelope.
// This writes only the explicitly selected public statistics, never auth tokens.
import { readFile, mkdir, writeFile, rename, copyFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const input = process.argv[2];
if (!input)
  throw new Error(
    "Usage: node scripts/import-board-history.mjs <record-list.json>"
  );
const envelope = JSON.parse(await readFile(input, "utf8"));
const data = envelope.data;
if (!envelope.ok || !data || data.has_more !== false)
  throw new Error("Expected a complete successful record export");
const fields = ["球员姓名", "场均得分", "出勤次数", "球员标签"];
const indices = fields.map((f) => data.fields.indexOf(f));
if (indices.some((i) => i < 0))
  throw new Error("Missing required source fields");
const numeric = (v) =>
  v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const rows = data.data
  .map((row, i) => ({
    id: createHash("sha256")
      .update(data.record_id_list[i])
      .digest("hex")
      .slice(0, 24),
    name: String(row[indices[0]] ?? "").trim(),
    average: numeric(row[indices[1]]),
    attendance: numeric(row[indices[2]]),
    tags: Array.isArray(row[indices[3]])
      ? row[indices[3]].filter((v) => typeof v === "string")
      : [],
  }))
  .filter((r) => r.name);
const root = path.join(
  process.env.BASKETBALL_DATA_DIR ||
    path.join(process.cwd(), ".local-run/workbench"),
  "public-board"
);
await mkdir(root, { recursive: true });
const target = path.join(root, "history.json");
await copyFile(target, target + ".backup-" + Date.now()).catch((e) => {
  if (e.code !== "ENOENT") throw e;
});
const tmp = target + ".tmp";
await writeFile(
  tmp,
  JSON.stringify({ rows, importedAt: new Date().toISOString() }),
  { mode: 0o600 }
);
await rename(tmp, target);
console.log(`Imported ${rows.length} public player records.`);
