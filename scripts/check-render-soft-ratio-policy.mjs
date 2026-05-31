#!/usr/bin/env node
import assert from "node:assert/strict";
import { classifyDurationSyncPolicy } from "./render-duration-policy.mjs";

const soft = classifyDurationSyncPolicy({ order: 1, videoDuration: 8, audioDuration: 9.8 });
assert.equal(soft.requiresRegeneration, false, "minor 1.225x mismatch should not require full regeneration");
assert.equal(soft.strategy, "slowdown-loop", "minor long audio mismatch should use a non-freezing soft strategy");
assert.ok(soft.qualityWarnings.length >= 1, "soft mismatch should be recorded as a warning");

const imageModeSoft = classifyDurationSyncPolicy({ order: 2, videoDuration: 8, audioDuration: 12 });
assert.equal(imageModeSoft.requiresRegeneration, false, "image-mode scenes up to 1.70x and 4s hold should render with soft motion");
assert.equal(imageModeSoft.strategy, "slowdown-loop");

const longImageModeSoft = classifyDurationSyncPolicy({ order: 7, videoDuration: 8, audioDuration: 15.6, outputMode: "image" });
assert.equal(longImageModeSoft.requiresRegeneration, false, "image-mode scenes should allow longer motion extension without a freeze");
assert.equal(longImageModeSoft.strategy, "slowdown-loop");

const hardByRatio = classifyDurationSyncPolicy({ order: 6, videoDuration: 8, audioDuration: 14 });
assert.equal(hardByRatio.requiresRegeneration, true, "ratio above 1.70 should require regeneration");
assert.equal(hardByRatio.failureCode, "SCENE_DURATION_MISMATCH");
assert.equal(hardByRatio.failedSceneOrder, 6);

const hardByHold = classifyDurationSyncPolicy({ order: 3, videoDuration: 8, audioDuration: 12.5 });
assert.equal(hardByHold.requiresRegeneration, true, "more than 4s of extra audio should require regeneration for short image-mode scenes");
assert.equal(hardByHold.extraHoldSeconds > 4, true);

const longformSoftByRatio = classifyDurationSyncPolicy({ order: 5, videoDuration: 43, audioDuration: 50.46 });
assert.equal(longformSoftByRatio.requiresRegeneration, false, "longform scenes should not fail only because absolute hold exceeds 2s when ratio is soft");
assert.equal(longformSoftByRatio.strategy, "slowdown-loop");
assert.ok(longformSoftByRatio.qualityWarnings.some((warning) => warning.code === "SOFT_DURATION_MISMATCH"));

const normal = classifyDurationSyncPolicy({ order: 4, videoDuration: 8, audioDuration: 8.9 });
assert.equal(normal.requiresRegeneration, false);
assert.equal(normal.strategy, "setpts");

console.log(JSON.stringify({ ok: true, checked: "render-soft-ratio-policy" }));
