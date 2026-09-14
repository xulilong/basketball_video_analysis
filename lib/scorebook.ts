export type EventKind =
  | "one"
  | "two"
  | "three"
  | "assist"
  | "offRebound"
  | "defRebound"
  | "steal"
  | "block"
  | "turnover";
export const EVENT_LABELS: Record<EventKind, string> = {
  one: "罚球命中",
  two: "两分命中",
  three: "三分命中",
  assist: "助攻",
  offRebound: "进攻篮板",
  defRebound: "防守篮板",
  steal: "抢断",
  block: "盖帽",
  turnover: "失误",
};
export interface RosterPlayer {
  id: string;
  name: string;
  jersey: string;
  team: string;
  photo: string;
  capturedAt: number;
}
export interface LedgerEvent {
  id: string;
  playerId: string | null;
  kind: EventKind;
  timestamp: number;
  confirmed: boolean;
  note: string;
}
export interface Scorebook {
  version: 1;
  players: RosterPlayer[];
  events: LedgerEvent[];
  excludedCandidates?: string[];
}
export const emptyBook = (): Scorebook => ({
  version: 1,
  players: [],
  events: [],
});
export function excludeCandidate(
  book: Scorebook,
  candidateId: string
): Scorebook {
  return {
    ...book,
    excludedCandidates: Array.from(
      new Set([...(book.excludedCandidates || []), candidateId])
    ),
    events: book.events.filter((e) => e.id !== `sample-${candidateId}`),
  };
}
export function statistics(book: Scorebook) {
  return book.players.map((player) => {
    const events = book.events.filter(
      (e) => e.confirmed && e.playerId === player.id
    );
    const count = (kind: EventKind) =>
      events.filter((e) => e.kind === kind).length;
    return {
      ...player,
      points: count("one") + 2 * count("two") + 3 * count("three"),
      assists: count("assist"),
      rebounds: count("offRebound") + count("defRebound"),
      offRebounds: count("offRebound"),
      defRebounds: count("defRebound"),
      steals: count("steal"),
      blocks: count("block"),
      turnovers: count("turnover"),
    };
  });
}
export function mergePlayers(
  book: Scorebook,
  from: string,
  into: string
): Scorebook {
  if (
    from === into ||
    !book.players.some((p) => p.id === from) ||
    !book.players.some((p) => p.id === into)
  )
    return book;
  return {
    ...book,
    players: book.players.filter((p) => p.id !== from),
    events: book.events.map((e) =>
      e.playerId === from ? { ...e, playerId: into } : e
    ),
  };
}
export function removePlayer(book: Scorebook, id: string): Scorebook {
  return {
    ...book,
    players: book.players.filter((p) => p.id !== id),
    events: book.events.map((e) =>
      e.playerId === id ? { ...e, playerId: null, confirmed: false } : e
    ),
  };
}
export function timeLabel(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}
export function statsCSV(book: Scorebook) {
  return (
    "\ufeff" +
    [
      [
        "球员",
        "号码",
        "球队",
        "得分",
        "助攻",
        "篮板",
        "进攻篮板",
        "防守篮板",
        "抢断",
        "盖帽",
        "失误",
      ],
      ...statistics(book).map((p) => [
        p.name,
        p.jersey,
        p.team,
        p.points,
        p.assists,
        p.rebounds,
        p.offRebounds,
        p.defRebounds,
        p.steals,
        p.blocks,
        p.turnovers,
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}
