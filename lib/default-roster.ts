import { readFile } from "node:fs/promises";
import path from "node:path";
import { storageRoot } from "./workspace-context";
import { importRoster } from "./player-profiles";
import type { Workbench } from "./workbench-types";
// Only explicitly imported names/numbers are shared as a starting template.
// Each account owns its IDs, photos, edits and statistics independently.
export async function initializeRoster(db: Workbench) {
  let rows;
  try {
    rows = JSON.parse(
      await readFile(path.join(storageRoot(), "default-roster.json"), "utf8")
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    throw e;
  }
  if (!Array.isArray(rows)) throw new Error("初始球员名单格式错误");
  importRoster(db, rows);
}
