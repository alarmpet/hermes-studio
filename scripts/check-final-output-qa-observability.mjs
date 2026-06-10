#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");
const renderScript = readFileSync(resolve(root, "scripts/render-youtube-with-tts.mjs"), "utf8");

assert.match(workflow + stages, /finalOutputQa/, "workflow should emit final output QA results");
assert.match(workflow + stages, /failureCodes/, "workflow should include QA failure codes in event details");
assert.match(workflow + stages, /visualCategoryDistribution/, "workflow should include visual category distribution diagnostics");
assert.match(workflow + stages, /durationDrift/, "workflow should include target duration drift diagnostics");
assert.match(renderScript, /renderEffectPreset/, "render report should include render effect preset");
assert.match(renderScript, /transitionPreset/, "render report should include transition preset");
assert.match(renderScript, /motionPreset/, "render report should include per-scene motion preset");
assert.match(renderScript, /motionAxis/, "render report should include per-scene motion axis");
assert.match(renderScript, /motionDirection/, "render report should include per-scene motion direction");
assert.match(renderScript, /motionEnergy/, "render report should include per-scene motion energy");
assert.match(renderScript, /advancedEffectsFallback/, "render report should expose effect fallback");
assert.match(renderScript, /titleOverlay/, "render report should expose title overlay metadata");
assert.match(workflow, /titleOverlay:\s*\{/, "workflow should write title overlay render options");
assert.match(stages, /motionAxis/, "workflow stages should emit selected motion axis");
assert.match(stages, /motionDirection/, "workflow stages should emit selected motion direction");
assert.match(stages, /motionEnergy/, "workflow stages should emit selected motion energy");

console.log(JSON.stringify({ ok: true, checked: "final-output-qa-observability" }));
