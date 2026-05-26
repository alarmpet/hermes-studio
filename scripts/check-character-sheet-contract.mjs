#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { planScenesFromScript } from "../electron/services/script-planner.mjs";
import { getStylePreset } from "../electron/services/style-presets.mjs";
import { buildFlowIngredientPlan } from "../automation/google-flow-ingredients.mjs";

const fixturePath = "C:/Users/amd/hermes/tests/fixtures/character-sheet.png";
mkdirSync(dirname(fixturePath), { recursive: true });
writeFileSync(fixturePath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

const scenes = planScenesFromScript({
  title: "Smart glasses",
  script: "First scene. Second scene. Third scene.",
  targetSeconds: 30,
  customDurationSeconds: 30,
  characterProfile: "A consistent Korean male engineer in his 30s, black hair, gray jacket.",
  stylePreset: getStylePreset("documentary-handheld"),
  characterSheet: {
    mode: "text-and-image",
    profileText: "A consistent Korean male engineer in his 30s, black hair, gray jacket.",
    referenceImagePaths: [fixturePath],
  },
});

assert.ok(scenes.length >= 3);
assert.ok(scenes[0].image_prompt.includes("documentary realism"));
assert.ok(scenes[0].image_prompt.includes("Korean male engineer"));
assert.ok(scenes[0].flow_prompt_safety);

const ingredientPlan = buildFlowIngredientPlan({
  characterSheet: {
    mode: "text-and-image",
    profileText: "A consistent Korean male engineer.",
    referenceImagePaths: [fixturePath],
  },
});
assert.equal(ingredientPlan.enabled, true);
assert.equal(ingredientPlan.paths.length, 1);

console.log(JSON.stringify({ ok: true, checked: "character-sheet-contract" }));
