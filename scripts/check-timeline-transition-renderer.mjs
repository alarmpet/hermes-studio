#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildXfadeFilterGraph, validateXfadePlan } from "../electron/services/timeline-transition-renderer.mjs";

const composer = readFileSync(new URL("../electron/services/timeline-transition-renderer.mjs", import.meta.url), "utf8");
const renderScript = readFileSync(new URL("../scripts/render-youtube-with-tts.mjs", import.meta.url), "utf8");

assert.match(composer, /buildXfadeFilterGraph/, "transition renderer should build an xfade filter graph");
assert.match(composer, /validateXfadePlan/, "transition renderer should validate xfade boundaries before rendering");
assert.match(composer, /transitionSeconds/, "transition renderer should receive transition duration");
assert.match(composer, /cumulativeAudioDuration/, "transition offsets should use cumulative audio duration");
assert.match(composer, /audioDuration \+ transitionSeconds/, "visual tails should preserve audio/subtitle sync");
assert.match(composer, /actualVideoDurations/, "transition renderer should validate against probed video durations");
assert.match(renderScript, /transitionPreset/, "final render script should read transition preset");
assert.match(renderScript, /scene-render-manifest\.json/, "render report should include transition details");

assert.equal(validateXfadePlan({
  transitionSeconds: 0.3,
  sceneDurations: [4, 4],
  actualVideoDurations: [4.3, 4],
}).ok, true);
assert.equal(validateXfadePlan({
  transitionSeconds: 0.4,
  sceneDurations: [4, 4],
  actualVideoDurations: [4.1, 4],
}).ok, false);
assert.match(buildXfadeFilterGraph({ sceneCount: 2, transitionSeconds: 0.3, sceneDurations: [4, 4] }), /xfade=transition=fade:duration=0.3:offset=4.000/);

console.log("Timeline transition renderer contract OK");
