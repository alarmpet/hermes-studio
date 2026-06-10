#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const renderScript = readFileSync(new URL("../scripts/render-youtube-with-tts.mjs", import.meta.url), "utf8");
assert.match(renderScript, /async\s+function\s+extractRepresentativeFrame/, "render script should define extractRepresentativeFrame");
assert.match(renderScript, /candidates\s*=/, "representative frame selection should evaluate multiple candidates");
assert.match(renderScript, /sharp\(tempFramePath\)/, "representative frame selection should use sharp for analysis");
assert.match(renderScript, /meanRGB\s*<\s*15/, "representative frame selection should reject low meanRGB");
assert.match(renderScript, /stdevRGB\s*<\s*2\.5/, "representative frame selection should reject low stdevRGB");
assert.match(renderScript, /BLACK_FALLBACK_FRAME/, "representative frame selection should throw BLACK_FALLBACK_FRAME if all candidates are black");
assert.match(renderScript, /Split this scene narration into shorter video-safe beats/, "black fallback failure should tell the user how to recover");

console.log("check-video-fallback-frame-selection contract OK");
