import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultHighlightOptions,
  parseHighlightOptions,
} from "./highlight-options";
test("defaults and partial options are normalized", () => {
  assert.deepEqual(parseHighlightOptions({}), defaultHighlightOptions);
  assert.equal(
    parseHighlightOptions({
      mergeOverlaps: false,
      before: 8,
      musicId: "preset-drive",
    }).mergeOverlaps,
    false
  );
});
test("rejects invalid settings before launching a job", () => {
  for (const options of [
    { before: 0 },
    { after: 11 },
    { originalVolume: 2 },
    { musicVolume: NaN },
    { mergeOverlaps: "false" },
    { musicId: "../../private" },
    { before: "8" },
  ])
    assert.throws(() => parseHighlightOptions(options));
});
