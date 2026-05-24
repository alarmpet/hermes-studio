#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const runner = readFileSync(resolve(root, "youtube-job-runner.mjs"), "utf8");

assert.match(runner, /normalizeYouTubeJobRequest/, "Runner should normalize the shared job schema");
assert.match(runner, /runYouTubeJob/, "Runner should export runYouTubeJob");
assert.match(runner, /sendIntermediateMedia/, "Runner should honor final-only media delivery option");
assert.match(runner, /job-started/, "Runner should emit job-started events");
assert.match(runner, /job-completed/, "Runner should emit job-completed events");
assert.match(runner, /generateYouTubeWorkflowAssets/, "Runner should support workflow asset generation stage");
assert.match(runner, /renderFinalYouTubeVideo/, "Runner should support final render stage");

console.log(JSON.stringify({ ok: true, checked: "youtube-job-runner" }));
