#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");
const analyzer = readFileSync(resolve(root, "scripts/analyze-youtube-output.mjs"), "utf8");

assert.match(stages, /allowLiveImagePlaceholderFallback/, "Live placeholder fallback should require an explicit opt-in flag");
assert.match(stages, /job\?\.options\?\.mockMediaMode[\s\S]*context\.mockMediaMode/, "Production fallback block must still allow Mock Media Mode fallback");
assert.match(stages, /FLOW_IMAGE_SUBMIT_DID_NOT_START/, "Image submit failures should retain a specific failure code");
assert.match(stages, /actionRequired:\s*true/, "Image submit failures should surface user action when live fallback is not allowed");
assert.match(analyzer, /FLOW_IMAGE_LOCAL_PLACEHOLDER/, "Analyzer should flag local placeholder images");
assert.match(analyzer, /localFallbackImageScenes/, "Analyzer should summarize local fallback image scene orders");

console.log(JSON.stringify({ ok: true, checked: "flow-placeholder-production-block" }));
