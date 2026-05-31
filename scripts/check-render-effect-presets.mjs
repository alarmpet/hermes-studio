#!/usr/bin/env node
import assert from "node:assert/strict";
import { chooseSceneMotionPreset, getTransitionConfig } from "../electron/services/render-effect-presets.mjs";

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

const strongSamples = Array.from({ length: 8 }, (_, index) => chooseSceneMotionPreset({
  renderEffectPreset: "dynamic-shorts",
  motionIntensity: "strong",
  order: index + 1,
  section: index === 0 ? "hook" : "story",
  visualCategory: index % 2 ? "risk-or-tension" : "core-fact-demo",
}).name);
assert.ok(strongSamples.some((name) => /push|whip|punch|zoom/i.test(name)), "strong intensity should allow more energetic motion");
assert.ok(new Set(strongSamples).size >= 2, "scene effects should vary across scenes instead of using one fixed effect");

assert.equal(getTransitionConfig({ transitionPreset: "smooth-crossfade", transitionSeconds: 0.35 }).filter, "xfade");
assert.equal(getTransitionConfig({ transitionPreset: "none" }).seconds, 0);

console.log(JSON.stringify({ ok: true, checked: "render-effect-presets" }));
