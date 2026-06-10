import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const media = readFileSync(new URL("../automation/google-flow-media.mjs", import.meta.url), "utf8");

assert.match(
  media,
  /hasThinkingStatus/,
  "Flow submit probing should record the thinking/generating status",
);
assert.match(
  media,
  /hasStopButton/,
  "Flow submit probing should record the visible stop button while generation is active",
);
assert.match(
  media,
  /state\.hasThinkingStatus/,
  "Flow submit active detection should treat thinking/generating status as active",
);
assert.match(
  media,
  /state\.hasStopButton/,
  "Flow submit active detection should treat the stop button as active generation",
);

console.log("[flow-thinking-active-contract] ok");
