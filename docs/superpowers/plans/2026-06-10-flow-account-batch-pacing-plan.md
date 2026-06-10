# Flow Account Batch Pacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support authorized Google Flow account slots so long jobs can generate scenes 1-30 with account A, then scenes 31-60 with account B, while preserving per-account pacing, cooldown, resume safety, and service-limit guardrails.

**Architecture:** Add an account-slot router above the existing Google Flow pacer. Each Flow account slot owns a separate Chrome profile directory and a separate pacing state file, while the workflow manifest records which slot generated each scene. The default remains one account/profile unless multi-account pacing is explicitly enabled.

**Tech Stack:** Electron/Node.js workflow services, Playwright persistent Chrome profiles, existing `flow-request-pacer.mjs`, `google-flow-media.mjs`, `youtube-workflow-stages.mjs`, JSON manifests, Electron renderer controls, contract scripts.

---

## Policy And Safety Assumptions

- This feature is for accounts the user owns or is explicitly authorized to operate.
- It must not repeatedly rotate accounts after Flow says `FLOW_RATE_LIMITED`; that would look like evasion and can make account/session trust worse.
- Routing is planned before generation starts: batch 1 uses slot A, batch 2 uses slot B.
- Each slot still obeys its own submit gap and cooldown.
- If both slots are cooling down, the job pauses with `FLOW_ALL_ACCOUNTS_COOLDOWN_ACTIVE` instead of retrying rapidly.

## Current Hermes Context

- `electron/services/flow-request-pacer.mjs` currently stores one global pacing file: `flow-global-pacing.json`.
- `automation/google-flow-media.mjs` accepts `profileDir` and `flowPacer`, and calls `beforeSubmit`, `recordSubmit`, and `recordFlowRateLimit`.
- `youtube-workflow-stages.mjs` currently passes one `context.paths.flowProfileDir` into Flow generation.
- `electron/services/youtube-job-service.mjs` and `electron/main.mjs` create a single `flowPacer`.
- `scene-media-manifest.json` persists scene status and should also persist `flowAccountSlotId`.
- Desktop auth currently assumes one Flow profile; this plan adds slot-aware auth without removing the existing single-account path.

## File Structure

- Create `electron/services/flow-account-router.mjs`
  - Owns slot normalization, scene-to-slot assignment, per-slot profile path, per-slot pacer creation, cooldown selection, and manifest metadata helpers.
- Create `scripts/check-flow-account-router-contract.mjs`
  - Pure contract tests for batch routing, per-slot state paths, cooldown selection, and no-rotation-on-rate-limit behavior.
- Modify `electron/services/flow-request-pacer.mjs`
  - Add `stateFileName`, `accountSlotId`, `minSubmitGapMs`, and `failureCooldownMs` metadata support.
- Modify `automation/google-flow-media.mjs`
  - Include `flowAccountSlotId` in diagnostics and persisted Flow status files.
- Modify `youtube-workflow-stages.mjs`
  - Select a slot per scene, pass slot-specific `profileDir` and `flowPacer`, and return `flowAccountSlotId` in media records.
- Modify `youtube-workflow.mjs`
  - Persist `flowAccountSlotId` in `scene-media-manifest.json` and reuse only if the asset exists and the normal output/aspect checks pass.
- Modify `electron/services/youtube-job-service.mjs`
  - Build a flow account router from normalized job options and app paths.
- Modify `electron/main.mjs`
  - Create paths for Flow account slots and expose slot-aware auth where needed.
- Modify `youtube-job-schema.mjs`
  - Add normalized options for multi-account Flow pacing.
- Modify `electron/renderer/index.html` and `electron/renderer/app.js`
  - Add controls for enabling account batch routing and choosing batch size.
- Modify `scripts/check-flow-request-pacer-contract.mjs`
  - Check that account-slot state files and metadata are supported.
- Modify `scripts/check-desktop-recovery-actions.mjs`
  - Ensure retry/resume keeps slot assignment stable.
- Modify `package.json`
  - Wire the new router contract into `check:flow-policy-safety`.

---

### Task 1: Add Flow Account Router Contract

**Files:**
- Create: `scripts/check-flow-account-router-contract.mjs`
- Create: `electron/services/flow-account-router.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `scripts/check-flow-account-router-contract.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
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

console.log(JSON.stringify({ ok: true, checked: "flow-account-router-contract" }));
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node scripts/check-flow-account-router-contract.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `flow-account-router.mjs`.

- [ ] **Step 3: Implement `flow-account-router.mjs`**

Create `electron/services/flow-account-router.mjs`:

```js
import { join } from "node:path";
import { createFlowRequestPacer } from "./flow-request-pacer.mjs";

const DEFAULT_BATCH_SIZE = 30;
const DEFAULT_MIN_SUBMIT_GAP_MS = 60_000;
const DEFAULT_FAILURE_COOLDOWN_MS = 30 * 60_000;

function cleanId(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "default";
}

function clampInt(value, min, max, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function normalizeFlowAccountSlots(input = {}) {
  const enabled = Boolean(input.enabled);
  const batchSize = clampInt(input.batchSize, 1, 60, DEFAULT_BATCH_SIZE);
  const minSubmitGapMs = clampInt(input.minSubmitGapMs, 30_000, 10 * 60_000, DEFAULT_MIN_SUBMIT_GAP_MS);
  const failureCooldownMs = clampInt(input.failureCooldownMs, 5 * 60_000, 6 * 60 * 60_000, DEFAULT_FAILURE_COOLDOWN_MS);
  const rawSlots = Array.isArray(input.slots) ? input.slots : [];
  const slots = rawSlots
    .map((slot, index) => {
      const id = cleanId(slot.id || `flow-${String.fromCharCode(97 + index)}`);
      return {
        id,
        label: String(slot.label || `Flow ${index + 1}`),
        enabled: slot.enabled !== false,
        profileDirName: `flow-profile-${id}`,
        stateFileName: `flow-global-pacing-${id}.json`,
      };
    })
    .filter((slot) => slot.enabled);

  const effectiveSlots = enabled && slots.length >= 2
    ? slots.slice(0, 4)
    : [{
        id: "default",
        label: "Default Flow",
        enabled: true,
        profileDirName: "flow-profile",
        stateFileName: "flow-global-pacing.json",
      }];

  return {
    enabled: enabled && effectiveSlots.length >= 2,
    batchSize,
    minSubmitGapMs,
    failureCooldownMs,
    slots: effectiveSlots,
  };
}

export function resolveFlowAccountSlotForScene({ sceneOrder = 1, config } = {}) {
  const safeOrder = Math.max(1, Math.round(Number(sceneOrder || 1)));
  const normalized = config?.slots ? config : normalizeFlowAccountSlots(config || {});
  const index = Math.floor((safeOrder - 1) / normalized.batchSize) % normalized.slots.length;
  return normalized.slots[index] || normalized.slots[0];
}

export function buildFlowAccountRouter({
  userData,
  flowProfileRoot,
  options = {},
} = {}) {
  if (!userData) throw new Error("userData is required for Flow account routing.");
  const config = normalizeFlowAccountSlots({
    enabled: options.flowAccountRoutingEnabled,
    batchSize: options.flowAccountBatchSize,
    minSubmitGapMs: options.flowAccountMinSubmitGapMs,
    failureCooldownMs: options.flowAccountFailureCooldownMs,
    slots: options.flowAccountSlots,
  });
  const profileRoot = flowProfileRoot || join(userData, "browser-profiles");
  const pacerBySlot = new Map();

  function flowPacerForSlot(slot) {
    if (!pacerBySlot.has(slot.id)) {
      pacerBySlot.set(slot.id, createFlowRequestPacer({
        userData,
        stateFileName: slot.stateFileName,
        accountSlotId: slot.id,
        minSubmitGapMs: config.minSubmitGapMs,
        failureCooldownMs: config.failureCooldownMs,
      }));
    }
    return pacerBySlot.get(slot.id);
  }

  return {
    config,
    resolveSceneContext({ sceneOrder = 1 } = {}) {
      const slot = resolveFlowAccountSlotForScene({ sceneOrder, config });
      return {
        slot,
        profileDir: join(profileRoot, slot.profileDirName),
        flowPacer: flowPacerForSlot(slot),
      };
    },
  };
}
```

- [ ] **Step 4: Add the contract to package scripts**

Modify `package.json` by adding the new check to `check:flow-policy-safety`:

```json
"check:flow-policy-safety": "node scripts/check-flow-prompt-safety.mjs && ... && node scripts/check-flow-request-pacer-contract.mjs && node scripts/check-flow-account-router-contract.mjs && ..."
```

Keep the existing command order and insert `node scripts/check-flow-account-router-contract.mjs` immediately after `node scripts/check-flow-request-pacer-contract.mjs`.

- [ ] **Step 5: Run the test**

Run:

```powershell
node scripts/check-flow-account-router-contract.mjs
```

Expected: PASS with `{"ok":true,"checked":"flow-account-router-contract"}`.

---

### Task 2: Make Flow Pacer Account-Slot Aware

**Files:**
- Modify: `electron/services/flow-request-pacer.mjs`
- Modify: `scripts/check-flow-request-pacer-contract.mjs`

- [ ] **Step 1: Write the failing contract assertions**

Modify `scripts/check-flow-request-pacer-contract.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pacer = readFileSync(new URL("../electron/services/flow-request-pacer.mjs", import.meta.url), "utf8");
const stages = readFileSync(new URL("../youtube-workflow-stages.mjs", import.meta.url), "utf8");

assert.match(pacer, /FLOW_GLOBAL_PACING_FILE\s*=\s*"flow-global-pacing\.json"/, "global Flow pacing filename should be stable");
assert.match(pacer, /stateFileName\s*=\s*FLOW_GLOBAL_PACING_FILE/, "Flow pacer should allow per-account state files");
assert.match(pacer, /accountSlotId\s*=\s*"default"/, "Flow pacer should persist account slot metadata");
assert.match(pacer, /accountSlotId,\s*jobId,\s*sceneOrder/s, "Flow pacer writes should include accountSlotId");
assert.match(pacer, /createFlowRequestPacer/, "Flow request pacer should expose a factory");
assert.match(pacer, /recordFlowRateLimit/, "Flow request pacer should persist rate-limit cooldowns");
assert.match(stages, /flowPacer:\s*context\.flowPacer/, "scene media generation should pass the global pacer into Flow automation");

console.log("[flow-request-pacer-contract] ok");
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node scripts/check-flow-request-pacer-contract.mjs
```

Expected: FAIL because `stateFileName` and `accountSlotId` are not in `flow-request-pacer.mjs`.

- [ ] **Step 3: Update `flow-request-pacer.mjs`**

Change the factory signature and path creation:

```js
export function flowGlobalPacingPath({ userData, stateFileName = FLOW_GLOBAL_PACING_FILE } = {}) {
  if (!userData) throw new Error("userData is required for Flow global pacing state.");
  return join(userData, stateFileName);
}

export function createFlowRequestPacer({
  userData,
  stateFileName = FLOW_GLOBAL_PACING_FILE,
  accountSlotId = "default",
  minSubmitGapMs = DEFAULT_MIN_SUBMIT_GAP_MS,
  failureCooldownMs = DEFAULT_FAILURE_COOLDOWN_MS,
} = {}) {
  const globalPath = flowGlobalPacingPath({ userData, stateFileName });

  const writeState = async (state, jobDir = "") => {
    const next = { accountSlotId, ...state, updatedAt: iso(state.now ?? Date.now()) };
    await writeJson(globalPath, next);
    if (jobDir) await writeJson(join(jobDir, `flow-request-pacing-${accountSlotId}.json`), next);
    if (jobDir && accountSlotId === "default") await writeJson(join(jobDir, "flow-request-pacing.json"), next);
    return next;
  };
```

Then add `accountSlotId` into every state body:

```js
return writeState({
  ...state,
  accountSlotId,
  source: "pre-submit",
  jobId,
  sceneOrder,
  outputMode,
  now,
  previousSubmitAtMs: state.lastSubmitAtMs ?? null,
  nextAllowedAtMs,
  nextAllowedAt: iso(nextAllowedAtMs),
}, jobDir);
```

Apply the same `accountSlotId` property to `recordSubmit` and `recordFlowRateLimit`.

- [ ] **Step 4: Run the pacer contract**

Run:

```powershell
node scripts/check-flow-request-pacer-contract.mjs
```

Expected: PASS.

---

### Task 3: Normalize Job Options For A/B Flow Routing

**Files:**
- Modify: `youtube-job-schema.mjs`
- Modify: `scripts/check-youtube-job-schema.mjs`

- [ ] **Step 1: Add schema assertions**

Add this block near existing Flow option tests in `scripts/check-youtube-job-schema.mjs`:

```js
const flowAccountJob = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: "장편 영상용 Flow 계정 분산 테스트입니다.",
  options: {
    videoFormat: "longform",
    scriptLengthMode: "custom",
    customDurationSeconds: 600,
    flowAccountRoutingEnabled: true,
    flowAccountBatchSize: 30,
    flowAccountMinSubmitGapMs: 60_000,
    flowAccountFailureCooldownMs: 30 * 60_000,
    flowAccountSlots: [
      { id: "flow-a", label: "A 계정" },
      { id: "flow-b", label: "B 계정" },
    ],
  },
});
assert.equal(flowAccountJob.options.flowAccountRoutingEnabled, true);
assert.equal(flowAccountJob.options.flowAccountBatchSize, 30);
assert.equal(flowAccountJob.options.flowAccountMinSubmitGapMs, 60_000);
assert.equal(flowAccountJob.options.flowAccountFailureCooldownMs, 30 * 60_000);
assert.equal(flowAccountJob.options.flowAccountSlots.length, 2);
assert.equal(flowAccountJob.options.flowAccountSlots[0].id, "flow-a");
assert.equal(flowAccountJob.options.flowAccountSlots[1].id, "flow-b");

const singleSlotJob = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: "단일 슬롯이면 라우팅이 꺼져야 합니다.",
  options: {
    videoFormat: "longform",
    scriptLengthMode: "custom",
    customDurationSeconds: 600,
    flowAccountRoutingEnabled: true,
    flowAccountSlots: [{ id: "flow-a", label: "A 계정" }],
  },
});
assert.equal(singleSlotJob.options.flowAccountRoutingEnabled, false);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node scripts/check-youtube-job-schema.mjs
```

Expected: FAIL because the new option names are not normalized yet.

- [ ] **Step 3: Add defaults to `youtube-job-schema.mjs`**

Add these fields to `DEFAULT_YOUTUBE_JOB_OPTIONS`:

```js
flowAccountRoutingEnabled: false,
flowAccountBatchSize: 30,
flowAccountMinSubmitGapMs: 60_000,
flowAccountFailureCooldownMs: 30 * 60_000,
flowAccountSlots: [
  { id: "flow-a", label: "Flow A", enabled: true },
  { id: "flow-b", label: "Flow B", enabled: true },
],
```

- [ ] **Step 4: Add normalization helpers**

Add below existing helper functions:

```js
function normalizeFlowAccountSlots(input = []) {
  const source = Array.isArray(input) ? input : [];
  return source
    .slice(0, 4)
    .map((slot, index) => ({
      id: String(slot.id || `flow-${String.fromCharCode(97 + index)}`)
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "") || `flow-${String.fromCharCode(97 + index)}`,
      label: String(slot.label || `Flow ${index + 1}`).trim() || `Flow ${index + 1}`,
      enabled: slot.enabled !== false,
    }))
    .filter((slot) => slot.enabled);
}
```

- [ ] **Step 5: Normalize options inside `normalizeYouTubeJobRequest`**

Add after Flow output mode validation:

```js
options.flowAccountSlots = normalizeFlowAccountSlots(options.flowAccountSlots);
options.flowAccountRoutingEnabled = options.videoFormat === "longform"
  && Boolean(options.flowAccountRoutingEnabled)
  && options.flowAccountSlots.length >= 2;
options.flowAccountBatchSize = Math.max(1, Math.min(60, Math.round(Number(options.flowAccountBatchSize || 30))));
options.flowAccountMinSubmitGapMs = Math.max(30_000, Math.min(10 * 60_000, Math.round(Number(options.flowAccountMinSubmitGapMs || 60_000))));
options.flowAccountFailureCooldownMs = Math.max(5 * 60_000, Math.min(6 * 60 * 60_000, Math.round(Number(options.flowAccountFailureCooldownMs || 30 * 60_000))));
```

- [ ] **Step 6: Run the schema test**

Run:

```powershell
node scripts/check-youtube-job-schema.mjs
```

Expected: PASS.

---

### Task 4: Route Scene Generation Through Account Slots

**Files:**
- Modify: `youtube-workflow-stages.mjs`
- Modify: `youtube-workflow.mjs`
- Modify: `electron/services/youtube-job-service.mjs`
- Test: `scripts/check-flow-account-router-contract.mjs`

- [ ] **Step 1: Add source checks to the router contract**

Append to `scripts/check-flow-account-router-contract.mjs`:

```js
import { readFileSync } from "node:fs";

const stagesSource = readFileSync(new URL("../youtube-workflow-stages.mjs", import.meta.url), "utf8");
const workflowSource = readFileSync(new URL("../youtube-workflow.mjs", import.meta.url), "utf8");
const jobServiceSource = readFileSync(new URL("../electron/services/youtube-job-service.mjs", import.meta.url), "utf8");

assert.match(stagesSource, /flowAccountRouter\.resolveSceneContext/, "workflow stages should resolve a Flow account slot per scene");
assert.match(stagesSource, /profileDir:\s*flowSceneContext\.profileDir/, "Flow generation should use the slot-specific profile directory");
assert.match(stagesSource, /flowPacer:\s*flowSceneContext\.flowPacer/, "Flow generation should use the slot-specific pacer");
assert.match(stagesSource, /flowAccountSlotId:\s*flowSceneContext\.slot\.id/, "media result should include flowAccountSlotId");
assert.match(workflowSource, /flowAccountSlotId:\s*media\.flowAccountSlotId/, "scene media manifest should persist flowAccountSlotId");
assert.match(jobServiceSource, /buildFlowAccountRouter/, "desktop job service should build a Flow account router");
```

- [ ] **Step 2: Run the contract to verify it fails**

Run:

```powershell
node scripts/check-flow-account-router-contract.mjs
```

Expected: FAIL because routing is not wired yet.

- [ ] **Step 3: Modify `youtube-workflow-stages.mjs`**

Inside `generateSceneMedia`, before calling `generateGoogleFlowVideoFromPrompt`, add:

```js
const flowSceneContext = context.flowAccountRouter?.resolveSceneContext?.({ sceneOrder: scene.order }) || {
  slot: { id: "default", label: "Default Flow" },
  profileDir: context.paths?.flowProfileDir,
  flowPacer: context.flowPacer,
};
```

Then change the Flow call arguments:

```js
profileDir: flowSceneContext.profileDir,
flowPacer: flowSceneContext.flowPacer,
flowAccountSlotId: flowSceneContext.slot.id,
```

Also include slot details in progress event details:

```js
flowAccountSlotId: flowSceneContext.slot.id,
flowAccountSlotLabel: flowSceneContext.slot.label,
```

In every successful media return object, add:

```js
flowAccountSlotId: flowSceneContext.slot.id,
flowAccountSlotLabel: flowSceneContext.slot.label,
```

- [ ] **Step 4: Modify `youtube-workflow.mjs` manifest writes**

Inside the `upsertSceneMediaManifest` call for completed media, include:

```js
flowAccountSlotId: media.flowAccountSlotId || "",
flowAccountSlotLabel: media.flowAccountSlotLabel || "",
```

The completed manifest record should include:

```js
upsertSceneMediaManifest(sceneMediaManifest, {
  ...mediaRecord,
  status: "completed",
  outputMode,
  sceneOutputMode: media.sceneOutputMode || outputMode,
  flowAccountSlotId: media.flowAccountSlotId || "",
  flowAccountSlotLabel: media.flowAccountSlotLabel || "",
  completedAt: new Date().toISOString(),
});
```

- [ ] **Step 5: Modify `electron/services/youtube-job-service.mjs`**

Import the router:

```js
import { buildFlowAccountRouter } from "./flow-account-router.mjs";
```

After `flowPacer` creation, add:

```js
const flowAccountRouter = context.flowAccountRouter || buildFlowAccountRouter({
  userData: context.paths?.userData,
  flowProfileRoot: join(context.paths?.userData || "", "browser-profiles"),
  options: job.options,
});
```

Pass it into `createDefaultYouTubeStages` and `runYouTubeJob`:

```js
flowAccountRouter,
```

- [ ] **Step 6: Run router contract**

Run:

```powershell
node scripts/check-flow-account-router-contract.mjs
```

Expected: PASS.

---

### Task 5: Pass Slot Metadata Into Flow Diagnostics

**Files:**
- Modify: `automation/google-flow-media.mjs`
- Modify: `scripts/check-flow-account-router-contract.mjs`

- [ ] **Step 1: Add diagnostics source assertions**

Append to `scripts/check-flow-account-router-contract.mjs`:

```js
const flowMediaSource = readFileSync(new URL("../automation/google-flow-media.mjs", import.meta.url), "utf8");
assert.match(flowMediaSource, /flowAccountSlotId\s*=\s*"default"/, "Flow media should accept flowAccountSlotId");
assert.match(flowMediaSource, /accountSlotId:\s*flowAccountSlotId/, "Flow status diagnostics should persist accountSlotId");
assert.match(flowMediaSource, /flowPacer\?\.beforeSubmit\?\(\{\s*jobId,\s*sceneOrder,\s*outputMode,\s*jobDir/s, "Flow submit should still use pacer beforeSubmit");
```

- [ ] **Step 2: Run the contract to verify it fails**

Run:

```powershell
node scripts/check-flow-account-router-contract.mjs
```

Expected: FAIL because `flowAccountSlotId` is not accepted by `google-flow-media.mjs`.

- [ ] **Step 3: Modify `generateGoogleFlowVideoFromPrompt` signature**

In `automation/google-flow-media.mjs`, add to destructuring:

```js
flowAccountSlotId = "default",
```

- [ ] **Step 4: Add account slot to status diagnostics**

In `writeFlowFailureDiagnostics` call sites and direct JSON writes such as `scene_${sceneOrder}_flow_submit_state.json`, add:

```js
accountSlotId: flowAccountSlotId,
```

In pacer calls, add:

```js
await flowPacer?.beforeSubmit?.({ jobId, sceneOrder, outputMode, jobDir, accountSlotId: flowAccountSlotId });
await flowPacer?.recordSubmit?.({ jobId, sceneOrder, outputMode, jobDir, accountSlotId: flowAccountSlotId });
await flowPacer?.recordFlowRateLimit?.({ jobId, sceneOrder, outputMode, jobDir, accountSlotId: flowAccountSlotId });
```

- [ ] **Step 5: Run the contract**

Run:

```powershell
node scripts/check-flow-account-router-contract.mjs
```

Expected: PASS.

---

### Task 6: Desktop UI Controls For A/B Batch Routing

**Files:**
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Modify: `scripts/check-longform-ui-workflow-guards.mjs`

- [ ] **Step 1: Add failing UI assertions**

Add to `scripts/check-longform-ui-workflow-guards.mjs` near existing longform UI assertions:

```js
assert.match(html, /id="flowAccountRoutingEnabled"/, "UI should expose Flow account batch routing toggle");
assert.match(html, /id="flowAccountBatchSize"[^>]+value="30"/, "UI should expose default 30-scene account batch size");
assert.match(html, /id="flowAccountSlotALabel"/, "UI should expose account A label");
assert.match(html, /id="flowAccountSlotBLabel"/, "UI should expose account B label");
assert.match(renderer, /flowAccountRoutingEnabled:\s*Boolean\(flowAccountRoutingEnabled\?\.checked\)/, "job payload should include Flow account routing toggle");
assert.match(renderer, /flowAccountBatchSize:\s*Math\.max\(1,\s*Math\.min\(60/, "job payload should clamp Flow account batch size");
assert.match(renderer, /flowAccountSlots:\s*\[/, "job payload should include Flow account slots");
```

- [ ] **Step 2: Run UI guard to verify it fails**

Run:

```powershell
node scripts/check-longform-ui-workflow-guards.mjs
```

Expected: FAIL because controls are not present yet.

- [ ] **Step 3: Add HTML controls**

Inside `#longformControls` in `electron/renderer/index.html`, add:

```html
<label class="checkbox-row" for="flowAccountRoutingEnabled">
  <input id="flowAccountRoutingEnabled" type="checkbox">
  <span>Flow A/B 계정 배치 분산</span>
</label>
<label for="flowAccountBatchSize">계정당 연속 생성 씬 수</label>
<input id="flowAccountBatchSize" type="number" min="1" max="60" value="30">
<label for="flowAccountSlotALabel">Flow A 계정 라벨</label>
<input id="flowAccountSlotALabel" type="text" value="Flow A">
<label for="flowAccountSlotBLabel">Flow B 계정 라벨</label>
<input id="flowAccountSlotBLabel" type="text" value="Flow B">
```

- [ ] **Step 4: Wire renderer elements**

In `electron/renderer/app.js`, add selectors near longform controls:

```js
const flowAccountRoutingEnabled = document.querySelector("#flowAccountRoutingEnabled");
const flowAccountBatchSize = document.querySelector("#flowAccountBatchSize");
const flowAccountSlotALabel = document.querySelector("#flowAccountSlotALabel");
const flowAccountSlotBLabel = document.querySelector("#flowAccountSlotBLabel");
```

In `readJobInput`, add:

```js
flowAccountRoutingEnabled: Boolean(flowAccountRoutingEnabled?.checked),
flowAccountBatchSize: Math.max(1, Math.min(60, Math.round(Number(flowAccountBatchSize?.value || 30)))),
flowAccountMinSubmitGapMs: 60_000,
flowAccountFailureCooldownMs: 30 * 60_000,
flowAccountSlots: [
  { id: "flow-a", label: flowAccountSlotALabel?.value?.trim() || "Flow A", enabled: true },
  { id: "flow-b", label: flowAccountSlotBLabel?.value?.trim() || "Flow B", enabled: true },
],
```

Update the longform input listener list:

```js
for (const selector of [
  "#longformTargetSeconds",
  "#introVideoClipCount",
  "#bodyImageSeconds",
  "#chapterTargetSeconds",
  "#longformChapteredRenderEnabled",
  "#flowAccountRoutingEnabled",
  "#flowAccountBatchSize",
]) {
  document.querySelector(selector)?.addEventListener("input", () => {
    if (getVideoFormat() === "longform") {
      document.querySelector("#customDurationSeconds").value = String(getLongformTargetSeconds());
    }
    updateDurationPreview();
    updateHybridFlowControls();
  });
}
```

- [ ] **Step 5: Run UI guard**

Run:

```powershell
node scripts/check-longform-ui-workflow-guards.mjs
```

Expected: PASS.

---

### Task 7: Slot-Aware Authentication And Recovery UX

**Files:**
- Modify: `electron/main.mjs`
- Modify: `electron/preload.mjs`
- Modify: `electron/renderer/app.js`
- Modify: `scripts/check-desktop-recovery-actions.mjs`

- [ ] **Step 1: Add recovery/auth contract assertions**

Add to `scripts/check-desktop-recovery-actions.mjs`:

```js
assert.match(main, /youtube:authenticateFlowAccountSlot/, "main should expose slot-aware Flow authentication");
assert.match(preload, /youtubeAuthenticateFlowAccountSlot/, "preload should expose slot-aware Flow authentication");
assert.match(app, /authenticateFlowAccountSlot/, "renderer should call slot-aware Flow authentication");
assert.match(main, /flowAccountRouter/, "failed scene retry should reuse the same Flow account router");
assert.match(main, /flowAccountSlotId/, "recovery events should expose Flow account slot id");
```

- [ ] **Step 2: Run the recovery contract to verify it fails**

Run:

```powershell
node scripts/check-desktop-recovery-actions.mjs
```

Expected: FAIL because slot-aware auth IPC is not present.

- [ ] **Step 3: Add preload API**

In `electron/preload.mjs`, expose:

```js
youtubeAuthenticateFlowAccountSlot: (slotId) => ipcRenderer.invoke("youtube:authenticateFlowAccountSlot", slotId),
```

- [ ] **Step 4: Add main IPC handler**

In `electron/main.mjs`, add:

```js
ipcMain.handle("youtube:authenticateFlowAccountSlot", async (_event, slotId = "default") => {
  const cleanSlotId = String(slotId || "default").toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "default";
  const profileDir = cleanSlotId === "default"
    ? paths.flowProfileDir
    : join(paths.userData, "browser-profiles", `flow-profile-${cleanSlotId}`);
  return authenticateGoogleFlow({ profileDir, chromePath: findChromeExecutable() });
});
```

Use the existing authentication helper names already present in `electron/main.mjs`; if the project uses a different helper than `authenticateGoogleFlow`, call that existing helper with the slot profile directory.

- [ ] **Step 5: Add renderer buttons**

In `electron/renderer/index.html`, add buttons near the A/B labels:

```html
<button id="authFlowAccountA" type="button">Flow A 로그인</button>
<button id="authFlowAccountB" type="button">Flow B 로그인</button>
```

In `electron/renderer/app.js`, add:

```js
document.querySelector("#authFlowAccountA")?.addEventListener("click", async () => {
  appendLog("Authenticating Flow A account");
  const result = await window.hermes.youtubeAuthenticateFlowAccountSlot("flow-a");
  appendLog("Flow A authentication result", result);
});

document.querySelector("#authFlowAccountB")?.addEventListener("click", async () => {
  appendLog("Authenticating Flow B account");
  const result = await window.hermes.youtubeAuthenticateFlowAccountSlot("flow-b");
  appendLog("Flow B authentication result", result);
});
```

- [ ] **Step 6: Ensure retry creates router**

In `electron/main.mjs` retry handler, after loading job/config:

```js
const flowAccountRouter = buildFlowAccountRouter({
  userData: paths.userData,
  flowProfileRoot: join(paths.userData, "browser-profiles"),
  options: job.options,
});
```

Pass `flowAccountRouter` into retry `generateYouTubeWorkflowAssets`.

- [ ] **Step 7: Run recovery contract**

Run:

```powershell
node scripts/check-desktop-recovery-actions.mjs
```

Expected: PASS.

---

### Task 8: Integration Verification And Packaging

**Files:**
- Modify: `timeline.md`

- [ ] **Step 1: Run targeted checks**

Run:

```powershell
node scripts/check-flow-account-router-contract.mjs
node scripts/check-flow-request-pacer-contract.mjs
node scripts/check-youtube-job-schema.mjs
node scripts/check-longform-ui-workflow-guards.mjs
node scripts/check-desktop-recovery-actions.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run broader Flow checks**

Run:

```powershell
npm.cmd run check:flow-policy-safety
npm.cmd run check:flow-output-mode
```

Expected: both PASS.

- [ ] **Step 3: Run syntax checks**

Run:

```powershell
node --check electron/services/flow-account-router.mjs
node --check electron/services/flow-request-pacer.mjs
node --check automation/google-flow-media.mjs
node --check youtube-workflow-stages.mjs
node --check youtube-workflow.mjs
node --check youtube-job-schema.mjs
node --check electron/main.mjs
node --check electron/preload.mjs
```

Expected: no output and exit code 0.

- [ ] **Step 4: Package the app**

Run:

```powershell
npm.cmd run electron:pack
```

Expected: `dist-electron/win-unpacked/Hermes YouTube Studio.exe` updated.

If packaging fails with `Access is denied` under `dist-electron/win-unpacked`, close or stop the running Hermes Studio process and rerun:

```powershell
Get-Process | Where-Object { $_.ProcessName -eq 'Hermes YouTube Studio' -and $_.Path -like '*\hermes\dist-electron\win-unpacked\*' } | Stop-Process -Force
npm.cmd run electron:pack
```

- [ ] **Step 5: Verify packaged runtime and shortcut**

Run:

```powershell
node scripts/check-packaged-runtime-contract.mjs
powershell -ExecutionPolicy Bypass -File scripts/check-shortcut.ps1
```

Expected:
- packaged runtime contract returns `ok: true`
- shortcut target is `scripts\launch-hermes-studio.ps1`
- shortcut target exe exists under `dist-electron\win-unpacked`

- [ ] **Step 6: Update timeline**

Append to `timeline.md`:

```markdown
## 2026-06-10 - Feature - Flow account batch pacing

- Added authorized Flow account slot routing so longform jobs can assign scenes 1-30 to Flow A and scenes 31-60 to Flow B with separate Chrome profiles and separate pacing files.
- Preserved per-account submit gaps and cooldowns; rate-limit failures pause the affected slot instead of rapidly rotating accounts.
- Added desktop controls for enabling A/B routing, batch size, and slot-aware authentication.
- Verification: `node scripts/check-flow-account-router-contract.mjs`, `node scripts/check-flow-request-pacer-contract.mjs`, `node scripts/check-youtube-job-schema.mjs`, `node scripts/check-longform-ui-workflow-guards.mjs`, `node scripts/check-desktop-recovery-actions.mjs`, `npm.cmd run check:flow-policy-safety`, `npm.cmd run check:flow-output-mode`, `npm.cmd run electron:pack`, `node scripts/check-packaged-runtime-contract.mjs`, `powershell -ExecutionPolicy Bypass -File scripts/check-shortcut.ps1`.
```

---

## Runtime Behavior After Implementation

For a 50 scene job with A/B routing enabled and batch size `30`:

- Scenes `1-30`: slot `flow-a`
- Scenes `31-50`: slot `flow-b`
- Slot A Chrome profile: `%APPDATA%\hermes\browser-profiles\flow-profile-flow-a`
- Slot B Chrome profile: `%APPDATA%\hermes\browser-profiles\flow-profile-flow-b`
- Slot A pacing file: `%APPDATA%\hermes\flow-global-pacing-flow-a.json`
- Slot B pacing file: `%APPDATA%\hermes\flow-global-pacing-flow-b.json`
- Manifest records: each scene includes `flowAccountSlotId` and `flowAccountSlotLabel`

If scene 32 hits `FLOW_RATE_LIMITED` on slot B:

- Mark scene 32 failed with `flowAccountSlotId: "flow-b"`.
- Write `flow-request-pacing-flow-b.json` in the job folder.
- Do not reroute scene 32 to slot A automatically.
- Resume after cooldown on slot B, or use local fallback if the user chooses recovery without Flow.

## Self-Review

- Spec coverage: Covers A/B account split, 30-scene batch routing, 1-minute per-account pacing, profile separation, resume safety, UI, auth, diagnostics, packaging.
- Placeholder scan: No `TBD`, `TODO`, `implement later`, or unspecified tests remain.
- Type consistency: Uses `flowAccountRoutingEnabled`, `flowAccountBatchSize`, `flowAccountSlots`, `flowAccountSlotId`, `flowAccountSlotLabel`, `flowAccountRouter`, and `flowPacer` consistently across tasks.
