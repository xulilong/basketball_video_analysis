import type { ScoringEvent } from "./workbench-types";
/** Include a merged clip only when every basket has an unambiguous matching member. */
export function recordingClips(
  clips: { file: string; baskets: number[] }[],
  events: ScoringEvent[],
  associations: Record<string, string>,
  members: string[]
) {
  return clips
    .filter(
      (clip) =>
        clip.baskets.length > 0 &&
        clip.baskets.every((time) => {
          const matches = events.filter(
            (e) => Math.abs(e.timestamp - time) <= 1.5
          );
          return (
            matches.length === 1 &&
            matches[0].status === "estimated" &&
            !!matches[0].playerId &&
            members.includes(associations[matches[0].playerId!])
          );
        })
    )
    .map((c) => c.file);
}
