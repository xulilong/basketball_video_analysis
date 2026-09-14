export type AutomaticEvent = {
  id: string;
  timestamp: number;
  playerId: string | null;
  suggestedPlayerId?: string;
  points: number | null;
  status: "estimated" | "excluded" | "unresolved";
  reason: string;
  releaseTime?: number;
};
export type AutomaticScores = {
  videoKey: string;
  filename: string;
  analyzedSeconds: number;
  generatedAt: string;
  rosterSource: string;
  limitations: string[];
  events: AutomaticEvent[];
  players: {
    id: string;
    label: string;
    photo: string;
    made: number;
    two: number;
    three: number;
    unknownValue: number;
    pointsMin: number;
    pointsMax: number;
  }[];
};
