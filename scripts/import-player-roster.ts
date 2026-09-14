import { readFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { transaction, workbenchRoot } from "../lib/workbench-server";
import { importRoster } from "../lib/player-profiles";
async function main() {
  const filename = process.argv[2];
  if (!filename) throw new Error("Pass roster JSON path");
  const rows = JSON.parse(await readFile(filename, "utf8"));
  if (!Array.isArray(rows)) throw new Error("Invalid roster");
  await transaction(async (db) => {
    const archive = path.join(workbenchRoot(), "backups");
    await mkdir(archive, { recursive: true });
    await copyFile(
      path.join(workbenchRoot(), "database.json"),
      path.join(archive, `before-roster-${Date.now()}.json`)
    );
    console.log(importRoster(db, rows));
  });
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
