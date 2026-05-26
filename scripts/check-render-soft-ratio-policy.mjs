#!/usr/bin/env node
import assert from "node:assert/strict";
import { classifyDurationSyncPolicy } from "./render-duration-policy.mjs";

const soft = classifyDurationSyncPolicy({ order: 1, videoDuration: 8, audioDuration: 9.8 });
assert.equal(soft.requiresRegeneration, false, "minor 1.225x mismatch should not require full regeneration");
assert.equal(soft.strategy, "slowdown-loop", "minor long audio mismatch should use a non-freezing soft strategy");
assert.ok(soft.qualityWarnings.length >= 1, "soft mismatch should be recorded as a warning");

const hardByRatio = classifyDurationSyncPolicy({ order: 2, videoDuration: 8, audioDuration: 11 });
assert.equal(hardByRatio.requiresRegeneration, true, "ratio above 1.30 should require regeneration");
assert.equal(hardByRatio.failureCode, "SCENE_DURATION_MISMATCH");
assert.equal(hardByRatio.failedSceneOrder, 2);

const hardByHold = classifyDurationSyncPolicy({ order: 3, videoDuration: 8, audioDuration: 10.3 });
assert.equal(hardByHold.requiresRegeneration, true, "more than 2s of extra audio should require regeneration");
assert.equal(hardByHold.extraHoldSeconds > 2, true);

const normal = classifyDurationSyncPolicy({ order: 4, videoDuration: 8, audioDuration: 8.9 });
assert.equal(normal.requiresRegeneration, false);
assert.equal(normal.strategy, "setpts");

console.log(JSON.stringify({ ok: true, checked: "render-soft-ratio-policy" }));
