#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  chooseSceneMotionPreset,
  getMotionPresetMetadata,
  getTransitionConfig,
} from "../electron/services/render-effect-presets.mjs";

const none = chooseSceneMotionPreset({
  renderEffectPreset: "cinematic",
  motionIntensity: "none",
  order: 1,
  section: "hook",
});
assert.equal(none.name, "none", "none intensity should disable visible scene motion");

const light = chooseSceneMotionPreset({
  renderEffectPreset: "cinematic",
  motionIntensity: "light",
  order: 2,
  section: "point",
});
assert.ok([
  "slow-zoom-in", "slow-pull-back", "diagonal-drift", "tilt-reveal",
  "slow-pan-left", "slow-pan-right", "slow-pan-up", "slow-pan-down",
  "diagonal-drift-up-right", "diagonal-drift-down-left"
].includes(light.name), "light intensity should use calm motion effects");
assert.ok(light.direction, "motion choice should expose direction metadata");
assert.ok(light.axis, "motion choice should expose axis metadata");
assert.ok(light.energy, "motion choice should expose energy metadata");

const newPresetMetadata = [
  "center-breathe",
  "reveal-from-top",
  "reveal-from-bottom",
  "reverse-diagonal-drift",
  "subject-hold-push",
  "wide-pullback",
  "micro-parallax-crop",
  "edge-to-center",
].map((name) => getMotionPresetMetadata(name));
assert.ok(newPresetMetadata.every((item) => item && item.direction && item.axis), "new motion presets should have metadata");

const strongSamples = Array.from({ length: 8 }, (_, index) => chooseSceneMotionPreset({
  renderEffectPreset: "dynamic-shorts",
  motionIntensity: "strong",
  order: index + 1,
  section: index === 0 ? "hook" : "story",
  visualCategory: index % 2 ? "risk-or-tension" : "core-fact-demo",
}).name);
assert.ok(strongSamples.some((name) => /push|whip|punch|zoom/i.test(name)), "strong intensity should allow more energetic motion");
assert.ok(new Set(strongSamples).size >= 2, "scene effects should vary across scenes instead of using one fixed effect");

const sequence = Array.from({ length: 36 }, (_, index) => chooseSceneMotionPreset({
  renderEffectPreset: "cinematic",
  motionIntensity: "strong",
  order: index + 1,
  section: index < 3 ? "hook" : index > 30 ? "lesson" : "story",
  visualCategory: ["document", "map", "architecture", "portrait", "timeline", "artifact"][index % 6],
  jobId: "direction-balance-contract",
}));
let repeatedDirectionRun = 1;
let maxRepeatedDirectionRun = 1;
for (let index = 1; index < sequence.length; index += 1) {
  repeatedDirectionRun = sequence[index].direction === sequence[index - 1].direction ? repeatedDirectionRun + 1 : 1;
  maxRepeatedDirectionRun = Math.max(maxRepeatedDirectionRun, repeatedDirectionRun);
}
const leftToRightCount = sequence.filter((item) => item.direction === "left-to-right").length;
assert.ok(maxRepeatedDirectionRun <= 2, `same motion direction should not repeat more than twice, got ${maxRepeatedDirectionRun}`);
assert.ok(leftToRightCount / sequence.length <= 0.34, `left-to-right motion should not dominate, got ${leftToRightCount}/${sequence.length}`);
assert.ok(new Set(sequence.map((item) => item.axis)).size >= 3, "motion sequence should mix axes");

assert.equal(getTransitionConfig({ transitionPreset: "smooth-crossfade", transitionSeconds: 0.35 }).filter, "xfade");
assert.equal(getTransitionConfig({ transitionPreset: "none" }).seconds, 0);

console.log(JSON.stringify({ ok: true, checked: "render-effect-presets" }));
