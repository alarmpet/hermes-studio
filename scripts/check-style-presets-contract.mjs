#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listStylePresets, getStylePreset } from "../electron/services/style-presets.mjs";

const presets = listStylePresets();
assert.ok(presets.length >= 8, "should ship at least 8 curated style presets");
for (const id of [
  "cinematic-tech-news",
  "documentary-handheld",
  "clean-explainer",
  "product-macro",
  "futuristic-interface",
  "warm-human-story",
  "noir-investigation",
  "animated-clay",
]) {
  const preset = getStylePreset(id);
  assert.equal(preset.id, id);
  assert.ok(preset.promptSuffix.includes("Camera"));
  assert.ok(preset.promptSuffix.includes("Lighting"));
  assert.ok(preset.characterContinuity, `${preset.id} should define characterContinuity`);
  assert.ok(preset.worldContinuity, `${preset.id} should define worldContinuity`);
  assert.ok(preset.negativePrompt, `${preset.id} should define negativePrompt`);
  assert.ok(Array.isArray(preset.preferredOutputModes), `${preset.id} should expose preferredOutputModes`);
}

const stickman = getStylePreset("stickman-explainer");
assert.equal(stickman.id, "stickman-explainer");
assert.match(stickman.promptSuffix, /stickman|whiteboard/i, "Stickman preset should force stickman/whiteboard style");
assert.match(stickman.characterContinuity, /same|consistent|proportions/i, "Stickman preset should define character continuity");
assert.match(stickman.worldContinuity, /same|consistent|whiteboard|line/i, "Stickman preset should define world continuity");
assert.ok(stickman.preferredOutputModes.includes("image"), "Stickman should prefer image mode as a stable option");

const dbHelper = readFileSync(new URL("../bot_db_helper.py", import.meta.url), "utf8");
assert.match(dbHelper, /character_continuity/, "style preset DB should store character continuity");
assert.match(dbHelper, /world_continuity/, "style preset DB should store world continuity");
assert.match(dbHelper, /negative_prompt/, "style preset DB should store negative prompts");
assert.match(dbHelper, /preferred_output_modes/, "style preset DB should store preferred output modes");

console.log(JSON.stringify({ ok: true, checked: "style-presets-contract" }));
