import { mkdir, readFile, writeFile, rename, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { storageRoot } from "./workspace-context";
export type PublishedRow = {
  id: string;
  sourceUserId: string;
  sourcePersonId: string;
  name: string;
  jerseyNumber?: string;
  videos: number;
  made: number;
  knownPoints: number;
  unknownValue: number;
  publishedAt: string;
};
export const visibleRow = ({
  sourceUserId: _,
  sourcePersonId: __,
  ...row
}: PublishedRow) => row;
export async function boardTransaction<T>(
  fn: (rows: PublishedRow[]) => T | Promise<T>
): Promise<T> {
  const root = path.join(storageRoot(), "public-board");
  await mkdir(root, { recursive: true });
  const lock = path.join(root, "lock");
  let acquired = false;
  for (let n = 0; n < 200; n++) {
    try {
      await mkdir(lock);
      acquired = true;
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const info = await stat(lock).catch(() => null);
      if (info && Date.now() - info.mtimeMs > 60000)
        await rm(lock, { recursive: true, force: true });
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  if (!acquired) throw new Error("看板正在更新");
  try {
    const file = path.join(root, "published.json");
    const rows: PublishedRow[] = await readFile(file, "utf8")
      .then(JSON.parse)
      .catch((e) => {
        if (e.code === "ENOENT") return [];
        throw e;
      });
    const result = await fn(rows);
    const tmp = file + "." + randomUUID();
    await writeFile(tmp, JSON.stringify(rows));
    await rename(tmp, file);
    return result;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
export function publishRow(
  rows: PublishedRow[],
  row: Omit<PublishedRow, "id" | "publishedAt">
) {
  const index = rows.findIndex(
    (r) =>
      r.sourceUserId === row.sourceUserId &&
      r.sourcePersonId === row.sourcePersonId
  );
  const item = {
    ...row,
    id: index < 0 ? randomUUID() : rows[index].id,
    publishedAt: new Date().toISOString(),
  };
  if (index < 0) rows.push(item);
  else rows[index] = item;
  return item;
}
