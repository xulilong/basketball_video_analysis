export type JobStatus =
  | "uploaded"
  | "queued"
  | "running"
  | "complete"
  | "failed"
  | "cancelled";
export type DetectedPlayer = {
  anchor?: number[];
  prototypes?: number[][];
  id: string;
  photo: string;
  descriptor: number[];
  observations: number;
  first: number;
  last: number;
};
export type ScoringEvent = {
  id: string;
  timestamp: number;
  releaseTime?: number;
  playerId: string | null;
  points: 2 | 3 | null;
  status: "estimated" | "excluded" | "unresolved";
  reason: string;
};
export type VideoAnalysis = {
  identityMerge?: { before: number; after: number; merged: number };
  pipelineVersion?: number;
  descriptorKind?: string;
  version: 1;
  videoKey: string;
  duration: number;
  analyzedSeconds: number;
  elapsedSeconds: number;
  players: DetectedPlayer[];
  events: ScoringEvent[];
  warnings: string[];
  hoop: number[] | null;
};
export type Person = {
  roster?: boolean;
  archived?: boolean;
  jerseyNumber?: string;
  referencePhotos?: { id: string; url: string; createdAt: string }[];
  sourceRefs?: string[];
  edited?: boolean;
  id: string;
  name: string;
  photo: string;
  descriptors: number[][];
  createdAt: string;
};
export type VideoJob = {
  mediaArchived?: boolean;
  mediaCleanupPending?: boolean;
  archiveReceipt?: string;
  court?: { partial: boolean; note: string; sampledFrames: number };
  id: string;
  name: string;
  size: number;
  createdAt: string;
  status: JobStatus;
  pid?: number;
  error?: string;
  result?: VideoAnalysis;
  associations: Record<string, string>;
  autoMatched: string[];
};
export type Workbench = {
  myProfileId?: string;
  version: 1;
  players: Person[];
  videos: VideoJob[];
};
export type JobProgress = {
  status: JobStatus;
  stage: string;
  percent: number;
  processedSeconds?: number;
  elapsedSeconds?: number;
  message: string;
};
export type PersonStats = {
  jerseyNumber?: string;
  roster?: boolean;
  archived?: boolean;
  id: string;
  name: string;
  photo: string;
  videos: number;
  made: number;
  knownPoints: number;
  unknownValue: number;
  pointsMin: number;
  pointsMax: number;
};
export type WorkbenchView = {
  players: PersonStats[];
  videos: VideoJob[];
  progress: Record<string, JobProgress>;
};
