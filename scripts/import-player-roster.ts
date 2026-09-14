import { readFile, mkdir, copyFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { transaction, workbenchRoot } from "../lib/workbench-server";
import { importRoster, profileFields } from "../lib/player-profiles";
async function main() {
  const filename = process.argv[2];
  if (!filename) throw new Error("Pass roster JSON path");
  const rows = JSON.parse(await readFile(filename, "utf8"));
  if (!Array.isArray(rows)) throw new Error("Invalid roster");
  const validated = rows.map((row) => {
    if (typeof row.sourceKey !== "string" || !row.sourceKey)
      throw new Error("Missing source key");
    return { ...profileFields(row), sourceKey: row.sourceKey };
  });
  if (process.argv.includes("--defaults")) {
    await mkdir(workbenchRoot(), { recursive: true });
    const file = path.join(workbenchRoot(), "default-roster.json");
    await copyFile(file, file + `.backup-${Date.now()}`).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
    await writeFile(file + ".tmp", JSON.stringify(validated), { mode: 0o600 });
    await rename(file + ".tmp", file);
  }
  await transaction(async (db) => {
    const archive = path.join(workbenchRoot(), "backups");
    await mkdir(archive, { recursive: true });
    await copyFile(
      path.join(workbenchRoot(), "database.json"),
      path.join(archive, `before-roster-${Date.now()}.json`)
    ).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
    console.log(importRoster(db, validated));
  });
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
