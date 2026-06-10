#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");
const renderer = readFileSync(resolve(root, "scripts/render-youtube-with-tts.mjs"), "utf8");

assert.match(workflow, /splitIntroVideoNarrationByBudget/, "workflow should split video-mode narration before Flow generation");
assert.match(workflow, /maxIntroVideoNarrationSeconds/, "workflow should enforce intro video narration budget");
assert.match(renderer, /VIDEO_LOOP_EXTENSION/, "renderer should still classify loop extension if it happens");
assert.match(renderer, /requiresRegeneration|durationPolicy/, "renderer report should expose regeneration/duration policy details");
assert.match(renderer, /VIDEO_DURATION_REGEN_REQUIRED/, "renderer should classify large video loop holds as regeneration-required");

console.log(JSON.stringify({ ok: true, checked: "intro-video-duration-guard" }));
