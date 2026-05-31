#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const gemini = readFileSync(resolve(root, "automation/gemini-research-draft.mjs"), "utf8");
const workflow = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

assert.match(gemini, /assertDraftDurationContract/, "Gemini provider acceptance should enforce duration contract");
assert.match(gemini, /durationQa/, "provider-fallback-chain should record duration QA details");
assert.match(gemini, /repairAttempt/, "provider chain should expose provider repair attempts");
assert.match(gemini, /buildDurationRepairPrompt/, "short or long provider drafts should get a repair prompt");
assert.match(workflow, /assertDraftDurationContract/, "workflow normalized draft QA should enforce duration before Flow");
assert.ok(packageJson.scripts.check.includes("check-draft-duration-contract"), "npm run check should include duration contract check");
assert.ok(packageJson.scripts.check.includes("check-draft-duration-observability"), "npm run check should include duration observability check");

console.log(JSON.stringify({ ok: true, checked: "draft-duration-observability" }));
