#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildFlowAccountRouter,
  normalizeFlowAccountSlots,
  resolveFlowAccountSlotForScene,
} from "../electron/services/flow-account-router.mjs";

const userData = "C:/Users/amd/AppData/Roaming/hermes";

const slots = normalizeFlowAccountSlots({
  enabled: true,
  batchSize: 30,
  minSubmitGapMs: 60_000,
  failureCooldownMs: 30 * 60_000,
  slots: [
    { id: "flow-a", label: "Flow A" },
    { id: "flow-b", label: "Flow B" },
  ],
});

assert.equal(slots.enabled, true);
assert.equal(slots.batchSize, 30);
assert.equal(slots.slots.length, 2);
assert.equal(slots.slots[0].profileDirName, "flow-profile-flow-a");
assert.equal(slots.slots[1].profileDirName, "flow-profile-flow-b");
assert.equal(slots.slots[0].stateFileName, "flow-global-pacing-flow-a.json");
assert.equal(slots.slots[1].stateFileName, "flow-global-pacing-flow-b.json");

assert.equal(resolveFlowAccountSlotForScene({ sceneOrder: 1, config: slots }).id, "flow-a");
assert.equal(resolveFlowAccountSlotForScene({ sceneOrder: 30, config: slots }).id, "flow-a");
assert.equal(resolveFlowAccountSlotForScene({ sceneOrder: 31, config: slots }).id, "flow-b");
assert.equal(resolveFlowAccountSlotForScene({ sceneOrder: 60, config: slots }).id, "flow-b");
assert.equal(resolveFlowAccountSlotForScene({ sceneOrder: 61, config: slots }).id, "flow-a");

const router = buildFlowAccountRouter({
  userData,
  flowProfileRoot: join(userData, "browser-profiles"),
  options: {
    flowAccountRoutingEnabled: true,
    flowAccountBatchSize: 30,
    flowAccountSlots: [
      { id: "flow-a", label: "Flow A" },
      { id: "flow-b", label: "Flow B" },
    ],
    flowAccountMinSubmitGapMs: 60_000,
    flowAccountFailureCooldownMs: 30 * 60_000,
  },
});

const scene32 = router.resolveSceneContext({ sceneOrder: 32 });
assert.equal(scene32.slot.id, "flow-b");
assert.equal(scene32.profileDir, join(userData, "browser-profiles", "flow-profile-flow-b"));
assert.equal(scene32.flowPacer.globalPath, join(userData, "flow-global-pacing-flow-b.json"));

const scene8 = router.resolveSceneContext({ sceneOrder: 8 });
assert.equal(scene8.slot.id, "flow-a");
assert.equal(scene8.profileDir, join(userData, "browser-profiles", "flow-profile-flow-a"));
assert.equal(scene8.flowPacer.globalPath, join(userData, "flow-global-pacing-flow-a.json"));

const single = buildFlowAccountRouter({
  userData,
  flowProfileRoot: join(userData, "browser-profiles"),
  options: { flowAccountRoutingEnabled: false },
});
const singleScene = single.resolveSceneContext({ sceneOrder: 49 });
assert.equal(singleScene.slot.id, "default");
assert.equal(singleScene.profileDir, join(userData, "browser-profiles", "flow-profile"));
assert.equal(singleScene.flowPacer.globalPath, join(userData, "flow-global-pacing.json"));

const stagesSource = readFileSync(new URL("../youtube-workflow-stages.mjs", import.meta.url), "utf8");
const workflowSource = readFileSync(new URL("../youtube-workflow.mjs", import.meta.url), "utf8");
const jobServiceSource = readFileSync(new URL("../electron/services/youtube-job-service.mjs", import.meta.url), "utf8");
const flowMediaSource = readFileSync(new URL("../automation/google-flow-media.mjs", import.meta.url), "utf8");

assert.match(stagesSource, /flowAccountRouter\.resolveSceneContext/, "workflow stages should resolve a Flow account slot per scene");
assert.match(stagesSource, /profileDir:\s*flowSceneContext\.profileDir/, "Flow generation should use the slot-specific profile directory");
assert.match(stagesSource, /flowPacer:\s*flowSceneContext\.flowPacer/, "Flow generation should use the slot-specific pacer");
assert.match(stagesSource, /flowAccountSlotId:\s*flowSceneContext\.slot\.id/, "media result should include flowAccountSlotId");
assert.match(workflowSource, /flowAccountSlotId:\s*media\.flowAccountSlotId/, "scene media manifest should persist flowAccountSlotId");
assert.match(jobServiceSource, /buildFlowAccountRouter/, "desktop job service should build a Flow account router");
assert.match(flowMediaSource, /flowAccountSlotId\s*=\s*"default"/, "Flow media should accept flowAccountSlotId");
assert.match(flowMediaSource, /accountSlotId:\s*flowAccountSlotId/, "Flow status diagnostics should persist accountSlotId");
assert.match(flowMediaSource, /flowPacer\?\.beforeSubmit\?\.\(\{\s*jobId,\s*sceneOrder,\s*outputMode,\s*jobDir/s, "Flow submit should still use pacer beforeSubmit");

console.log(JSON.stringify({ ok: true, checked: "flow-account-router-contract" }));
