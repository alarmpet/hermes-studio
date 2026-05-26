#!/usr/bin/env node
import assert from "node:assert/strict";
import { chooseSceneMotionPreset, getTransitionConfig } from "../electron/services/render-effect-presets.mjs";

assert.equal(chooseSceneMotionPreset({ renderEffectPreset: "clean", order: 1, section: "hook" }).name, "slow-zoom-in");
assert.equal(chooseSceneMotionPreset({ renderEffectPreset: "cinematic", order: 2, visualCategory: "product" }).fps, 30);
assert.match(chooseSceneMotionPreset({ renderEffectPreset: "dynamic-shorts", order: 1, section: "hook" }).name, /push|whip|punch/);
assert.equal(getTransitionConfig({ transitionPreset: "smooth-crossfade", transitionSeconds: 0.35 }).filter, "xfade");
assert.equal(getTransitionConfig({ transitionPreset: "none" }).seconds, 0);

console.log("Render effect presets contract OK");
