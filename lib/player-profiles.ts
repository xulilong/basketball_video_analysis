import { randomUUID } from "node:crypto";
import type { Person, Workbench } from "./workbench-types";
export function profileFields(value: unknown) {
  const v = value as { name?: unknown; jerseyNumber?: unknown };
  if (
    !v ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.trim().length > 60
  )
    throw new Error("请输入 1–60 字的姓名");
  const number = v.jerseyNumber ?? "";
  if (typeof number !== "string" || !/^\d{0,3}$/.test(number.trim()))
    throw new Error("球衣号码请填写 0–999，可留空");
  return { name: v.name.trim(), jerseyNumber: number.trim() };
}
export function createProfile(db: Workbench, value: unknown): Person {
  const p: Person = {
    id: randomUUID(),
    ...profileFields(value),
    roster: true,
    edited: true,
    photo: "/assets/player-placeholder.svg",
    referencePhotos: [],
    descriptors: [],
    createdAt: new Date().toISOString(),
  };
  db.players.push(p);
  return p;
}
export function importRoster(
  db: Workbench,
  rows: { name: string; jerseyNumber: string; sourceKey: string }[]
) {
  let created = 0,
    skipped = 0;
  for (const row of rows) {
    const fields = profileFields(row);
    if (db.players.some((p) => p.sourceRefs?.includes(row.sourceKey))) {
      skipped++;
      continue;
    }
    const p = createProfile(db, fields);
    p.sourceRefs = [row.sourceKey];
    created++;
  }
  return { created, skipped };
}
