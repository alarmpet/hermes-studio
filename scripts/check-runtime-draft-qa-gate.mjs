#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

assert.match(stages, /validateDraftQuality/, "workflow stages must run draft QA during real jobs");
assert.match(stages, /Gemini draft failed QA|Draft QA failed/i, "Gemini QA failures should produce a specific warning or error");
assert.match(workflow, /validateDraftQuality/, "scene-proportional draft planning must run QA before Flow media generation");
assert.ok(packageJson.scripts.check.includes("check-youtube-draft-quality"), "npm run check must include draft QA check");
assert.ok(packageJson.scripts.check.includes("check-render-soft-ratio-policy"), "npm run check must include render ratio policy check");

console.log(JSON.stringify({ ok: true, checked: "runtime-draft-qa-gate" }));
