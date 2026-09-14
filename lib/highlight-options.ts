export type HighlightOptions = {
  before: number;
  after: number;
  mergeOverlaps: boolean;
  originalVolume: number;
  musicVolume: number;
  musicId: string;
};
export const defaultHighlightOptions: HighlightOptions = {
  before: 5,
  after: 2,
  mergeOverlaps: true,
  originalVolume: 1,
  musicVolume: 0.3,
  musicId: "none",
};
export const presetMusic = [
  {
    id: "preset-drive",
    name: "上场 · 动感节拍",
    description: "110 BPM · 鼓点 / 贝斯",
    url: "/assets/music/drive.m4a",
  },
  {
    id: "preset-chill",
    name: "落日球场 · 轻松律动",
    description: "85 BPM · 柔和和弦",
    url: "/assets/music/chill.m4a",
  },
];
export function parseHighlightOptions(value: unknown): HighlightOptions {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("剪辑配置格式无效");
  const o = { ...defaultHighlightOptions, ...value };
  for (const [key, min, max] of [
    ["before", 1, 15],
    ["after", 1, 10],
    ["originalVolume", 0, 1],
    ["musicVolume", 0, 1],
  ] as const) {
    if (
      typeof o[key] !== "number" ||
      !Number.isFinite(o[key]) ||
      o[key] < min ||
      o[key] > max
    )
      throw new Error(`${key} 超出允许范围`);
  }
  if (typeof o.mergeOverlaps !== "boolean") throw new Error("合并配置无效");
  if (
    typeof o.musicId !== "string" ||
    !/^(none|preset-drive|preset-chill|custom-[a-f0-9]{64})$/.test(o.musicId)
  )
    throw new Error("背景音乐无效");
  return {
    before: o.before,
    after: o.after,
    mergeOverlaps: o.mergeOverlaps,
    originalVolume: o.originalVolume,
    musicVolume: o.musicVolume,
    musicId: o.musicId,
  };
}
