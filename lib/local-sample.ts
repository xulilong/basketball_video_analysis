import path from "node:path";

// A single explicitly configured local file; callers cannot choose arbitrary paths.
export const sampleVideoPath = () =>
  path.resolve(
    process.env.BASKETBALL_SAMPLE_VIDEO ||
      path.join(process.cwd(), "..", "示例.mp4")
  );
export const sampleReviewPath = () =>
  path.join(process.cwd(), ".local-run", "sample-review");
