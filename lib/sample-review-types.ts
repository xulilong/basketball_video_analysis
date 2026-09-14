export interface SampleTracklet {
  label?: string;
  id: string;
  first: number;
  last: number;
  observations: number;
  capturedAt: number;
  photo: string;
}
export interface ShotCandidate {
  id: string;
  timestamp: number;
  start: number;
  end: number;
  reason: string;
}
export interface SampleReview {
  rawTrackletCount?: number;
  rosterSource?: string;
  videoKey: string;
  filename: string;
  trackingSeconds: number;
  scannedSeconds: number;
  processedFrames: number;
  ballFrames: number;
  tracklets: SampleTracklet[];
  shots: ShotCandidate[];
}
