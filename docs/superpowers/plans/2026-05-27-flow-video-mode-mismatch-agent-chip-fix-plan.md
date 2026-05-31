# Google Flow Video Mode Mismatch Agent Chip Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the repeated Google Flow failure where hybrid scene 1 requests video but Hermes clicks the Agent chip, leaving Flow in Nano Banana Pro image mode.

**Architecture:** Move Flow bottom-bar chip classification into a shared helper used by both generator-ready detection and output-mode switching. The selector must explicitly reject Agent/request chips and must prefer the real model/settings chip (`Nano Banana Pro`, `Veo`, `crop_9_16`, `1x`, `tune/settings`) before attempting image/video mode changes. Add regression tests based on the failed job artifacts so future static contract tests cannot pass while the real workflow still clicks Agent.

**Tech Stack:** Electron packaged app, Playwright browser automation, Google Flow web UI automation, Node.js contract tests, Hermes workflow diagnostics.

---

## Evidence From Failed Job

**Job:** `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779881814681`

**User-visible failure:**

```text
Progress 5%
Google Flow output mode mismatch. Requested video, but Flow UI appears to be image.
```

**Confirmed request:**

- `job-request.json` has `flowOutputMode: "hybrid"`.
- `hybridIntroVideoSceneCount: 1`.
- `scene-media-manifest.json` marks scene 1 as `outputMode: "video"`.
- So the job routing is correct: scene 1 really should be video.

**Actual Flow UI state:**

- `scene_1_flow_mode_mismatch.png` shows the bottom bar still in image mode:
  - left chip: `에이전트`
  - right model/settings chip: `Nano Banana Pro crop_9_16 1x`
- `scene_1_flow_mode_verification.json` reports `selectedOutputMode: "image"` and `selectedImageModel: "nano-banana-pro"`.

**Critical selector evidence:**

`scene_1_flow_mode_switch.json`:

```json
{
  "ok": false,
  "requestedOutputMode": "video",
  "results": [
    {
      "ok": true,
      "text": "에이전트 에이전트",
      "bottomGeneratorChip": true,
      "x": 425,
      "y": 663
    },
    {
      "ok": false,
      "reason": "No control matched: 동영상, video"
    }
  ]
}
```

`scene_1_flow_generator_ready.json` also marks the Agent chip as `generatorChip`, before mode switching starts.

**Root cause:**

`automation/google-flow-output-mode.mjs` and `automation/google-flow-media.mjs` still classify bottom controls with generic rules such as `width > 48` and do not reliably exclude the Agent/request chip. The existing `scripts/check-flow-output-mode-contract.mjs` checks broad strings like `bottomGeneratorChip`, but it does not prove that `isAgentChip()` exists or that a failed-job bottom-bar fixture selects the right `Nano Banana Pro` chip instead of Agent. The test passed while the real workflow remained broken.

**Review validation notes from `HERMES_FLOW_VIDEO_MODE_AGENT_CHIP_REVIEW.md`:**

- Valid: the shared chip classifier is the right primary fix because both mode switching and generator-ready detection currently make similar bottom-bar selection mistakes.
- Valid: browser-side classifier evaluation must be wrapped in `try/catch` so a serialized helper error is written to `scene_N_flow_mode_switch.json` instead of becoming an opaque Playwright failure.
- Valid: model-name matching should be forward-compatible with model version changes such as `Veo 3.2`, `Veo 4`, `Imagen 4`, or later `Imagen` versions.
- Valid with scope adjustment: DB diagnostics should include the selected/rejected chip details, but this should flow through the existing workflow event and `workflow-db-events.mjs` mirror rather than adding direct `bot_db_helper.py` calls inside `youtube-workflow-stages.mjs`.

---

## File Responsibility Map

- `automation/google-flow-chip-classifier.mjs`: New shared pure helper for bottom Flow chip scoring and selection. No Playwright dependency.
- `automation/google-flow-output-mode.mjs`: Use the shared classifier to open the model/settings chip before selecting image/video mode.
- `automation/google-flow-media.mjs`: Use the same classifier in `waitForFlowGeneratorReady()` so readiness diagnostics do not report Agent as the generator chip.
- `scripts/check-flow-output-mode-contract.mjs`: Strengthen static checks so Agent-chip exclusion is required.
- `scripts/check-flow-chip-classifier.mjs`: New fixture-level regression test using the failed job bottom-bar labels.
- `package.json`: Add the new classifier test to `npm run check`.
- `timeline.md`: Record the workflow fix.

---

## Task 1: Add a Pure Flow Chip Classifier Regression

**Files:**
- Create: `C:\Users\amd\hermes\automation\google-flow-chip-classifier.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-flow-chip-classifier.mjs`

- [ ] **Step 1: Create the failing classifier contract test**

Create `scripts/check-flow-chip-classifier.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { chooseFlowGeneratorChip, isAgentChip, isModelSettingsChip } from "../automation/google-flow-chip-classifier.mjs";

const failedJobBottomButtons = [
  { label: "add_2 만들기 add_2만들기", x: 350, y: 647, width: 32, height: 32 },
  { label: "에이전트 에이전트", x: 387, y: 647, width: 76, height: 32 },
  { label: "🍌 Nano Banana Pro crop_9_16 1x 🍌 Nano Banana Procrop_9_161x", x: 729, y: 646, width: 166, height: 34 },
  { label: "arrow_forward 만들기 arrow_forward만들기", x: 900, y: 647, width: 32, height: 32 },
];

assert.equal(isAgentChip("에이전트 에이전트"), true);
assert.equal(isAgentChip("Agent Agent"), true);
assert.equal(isModelSettingsChip("🍌 Nano Banana Pro crop_9_16 1x"), true);
assert.equal(isModelSettingsChip("Veo 3.1 - Lite 9:16 1x"), true);
assert.equal(isModelSettingsChip("Veo 3.2 crop_9_16 1x"), true);
assert.equal(isModelSettingsChip("Imagen 4 9:16 1x"), true);
assert.equal(isModelSettingsChip("에이전트 에이전트"), false);

const selected = chooseFlowGeneratorChip(failedJobBottomButtons);
assert.ok(selected, "classifier should select a bottom generator/model settings chip");
assert.match(selected.label, /Nano Banana Pro/i, "failed-job fixture must select Nano Banana Pro chip, not Agent");
assert.equal(selected.x, 729);

const videoStateButtons = [
  { label: "에이전트", x: 387, y: 647, width: 76, height: 32 },
  { label: "Veo 3.1 - Lite crop_9_16 1x", x: 720, y: 646, width: 190, height: 34 },
];
assert.match(chooseFlowGeneratorChip(videoStateButtons).label, /Veo 3\.1/i);

console.log(JSON.stringify({ ok: true, checked: "flow-chip-classifier" }));
```

Run:

```powershell
node scripts/check-flow-chip-classifier.mjs
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 2: Implement the minimal classifier helper**

Create `automation/google-flow-chip-classifier.mjs`:

```js
export function normalizeChipLabel(label = "") {
  return String(label || "").replace(/\s+/g, " ").trim();
}

export function isAgentChip(label = "") {
  const text = normalizeChipLabel(label).toLowerCase();
  return /agent|에이전트|요청 사항|request/i.test(text);
}

export function isCreateChip(label = "") {
  return /arrow_forward|create|generate|만들기/i.test(normalizeChipLabel(label).toLowerCase());
}

export function isAddMediaChip(label = "") {
  return /add_2|add|미디어 추가/i.test(normalizeChipLabel(label).toLowerCase());
}

export function isModelSettingsChip(label = "") {
  const text = normalizeChipLabel(label).toLowerCase();
  if (!text || isAgentChip(text) || isCreateChip(text) || isAddMediaChip(text)) return false;
  return /nano banana|imagen\s*\d*|veo\s*\d*|crop_9_16|9:16|16:9|1x|00:10|videocam|image|video|이미지|동영상|tune|settings|설정/i.test(text);
}

export function scoreFlowGeneratorChip(item = {}) {
  const label = normalizeChipLabel(item.label || item.text || "");
  if (!isModelSettingsChip(label)) return -Infinity;
  let score = 0;
  if (/veo\s*\d*|nano banana|imagen\s*\d*/i.test(label)) score += 100;
  if (/crop_9_16|9:16|16:9|1x/i.test(label)) score += 40;
  if (/동영상|이미지|video|image/i.test(label)) score += 20;
  if (/tune|settings|설정/i.test(label)) score += 10;
  score += Math.min(20, Number(item.width || item.rect?.width || 0) / 10);
  score += Math.min(20, Number(item.height || item.rect?.height || 0) / 4);
  return score;
}

export function chooseFlowGeneratorChip(items = []) {
  return [...items]
    .map((item) => ({ ...item, _score: scoreFlowGeneratorChip(item) }))
    .filter((item) => Number.isFinite(item._score))
    .sort((a, b) => b._score - a._score)[0] || null;
}
```

- [ ] **Step 3: Verify classifier test passes**

Run:

```powershell
node scripts/check-flow-chip-classifier.mjs
node --check automation/google-flow-chip-classifier.mjs
```

Expected: PASS.

---

## Task 2: Use the Shared Classifier in Flow Output Mode Switching

**Files:**
- Modify: `C:\Users\amd\hermes\automation\google-flow-output-mode.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-flow-output-mode-contract.mjs`

- [ ] **Step 1: Strengthen output-mode contract**

In `scripts/check-flow-output-mode-contract.mjs`, add:

```js
assert.match(outputModeHelper, /chooseFlowGeneratorChip/, "Flow mode switching must use the shared chip classifier");
assert.match(outputModeHelper, /isAgentChip|에이전트|Agent/, "Flow mode switching must explicitly reject Agent chips");
assert.match(outputModeHelper, /Browser-side classifier evaluation crash|eval-failed|classifier evaluation/i, "browser-side classifier failures should be bridged into JSON diagnostics");
assert.doesNotMatch(outputModeHelper, /width > 48\s*\|\|/, "Flow mode switching must not use broad width-only chip selection");
```

Run:

```powershell
node scripts/check-flow-output-mode-contract.mjs
```

Expected: FAIL until `google-flow-output-mode.mjs` uses the classifier.

- [ ] **Step 2: Import the classifier**

At the top of `automation/google-flow-output-mode.mjs`:

```js
import { chooseFlowGeneratorChip } from "./google-flow-chip-classifier.mjs";
```

- [ ] **Step 3: Replace `findBottomGeneratorChip` selection logic**

Inside `findBottomGeneratorChip`, replace broad candidate sorting with a serialized helper:

```js
const findBottomGeneratorChip = () => page.evaluate((classifierSource) => {
  try {
    const { chooseFlowGeneratorChip } = Function(`${classifierSource}; return { chooseFlowGeneratorChip };`)();
  const visible = (el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return !el.disabled
      && el.getAttribute("aria-disabled") !== "true"
      && style.visibility !== "hidden"
      && style.display !== "none"
      && rect.width > 8
      && rect.height > 8;
  };
  const textOf = (el) => [
    el.innerText,
    el.textContent,
    el.getAttribute("aria-label"),
    el.getAttribute("title"),
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const bottomItems = Array.from(document.querySelectorAll("button,[role='button']"))
    .filter(visible)
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        el,
        label: textOf(el),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    })
    .filter((item) => item.label && item.y > window.innerHeight * 0.64);

  const selected = chooseFlowGeneratorChip(bottomItems);
  if (!selected) {
    return {
      ok: false,
      reason: "model/settings chip not found",
      bottomGeneratorChip: false,
      bottomButtons: bottomItems.map(({ el, ...item }) => item),
    };
  }
  return {
    ok: true,
    text: selected.label,
    bottomGeneratorChip: true,
    x: Math.round(selected.x + selected.width / 2),
    y: Math.round(selected.y + selected.height / 2),
    score: selected._score,
    bottomButtons: bottomItems.map(({ el, ...item }) => item),
  };
  } catch (error) {
    return {
      ok: false,
      reason: `Browser-side classifier evaluation crash: ${error?.message || error}`,
      failureCode: "FLOW_CHIP_CLASSIFIER_EVAL_FAILED",
      stack: error?.stack || "",
    };
  }
}, getFlowChipClassifierBrowserSource());
```

Add a local function that returns browser-safe classifier source without ESM exports:

```js
function getFlowChipClassifierBrowserSource() {
  return `
    ${normalizeChipLabel.toString()}
    ${isAgentChip.toString()}
    ${isCreateChip.toString()}
    ${isAddMediaChip.toString()}
    ${isModelSettingsChip.toString()}
    ${scoreFlowGeneratorChip.toString()}
    ${chooseFlowGeneratorChip.toString()}
  `;
}
```

Import all referenced classifier functions if this helper is used.

- [ ] **Step 4: Verify mode switching contract**

Run:

```powershell
node scripts/check-flow-output-mode-contract.mjs
node scripts/check-flow-chip-classifier.mjs
node --check automation/google-flow-output-mode.mjs
```

Expected: PASS.

---

## Task 3: Use the Same Classifier in Generator Ready Detection

**Files:**
- Modify: `C:\Users\amd\hermes\automation\google-flow-media.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-flow-output-mode-contract.mjs`

- [ ] **Step 1: Add contract coverage for ready-state detection**

In `scripts/check-flow-output-mode-contract.mjs`, add:

```js
assert.match(flow, /chooseFlowGeneratorChip/, "Flow generator-ready detection must use the shared chip classifier");
assert.doesNotMatch(flow, /generatorChip\s*=\s*bottomButtons\.find\(\(item\).*width > 48/s, "generator-ready detection must not treat Agent as the generator chip by width alone");
```

Run:

```powershell
node scripts/check-flow-output-mode-contract.mjs
```

Expected: FAIL until `google-flow-media.mjs` uses the classifier.

- [ ] **Step 2: Import the classifier helpers**

At the top of `automation/google-flow-media.mjs`:

```js
import {
  chooseFlowGeneratorChip,
  isAddMediaChip,
  isAgentChip,
  isCreateChip,
  isModelSettingsChip,
  normalizeChipLabel,
  scoreFlowGeneratorChip,
} from "./google-flow-chip-classifier.mjs";
```

- [ ] **Step 3: Replace `generatorChip` detection inside readiness evaluation**

Replace:

```js
const generatorChip = bottomButtons.find((item) => !/arrow_forward|create|generate|만들기/i.test(item.label) && item.width > 48);
```

with browser-evaluable classifier logic equivalent to:

```js
const generatorChip = chooseFlowGeneratorChip(bottomButtons);
```

The diagnostic JSON must still include:

```json
{
  "generatorChip": {
    "label": "Nano Banana Pro crop_9_16 1x",
    "x": 729,
    "y": 646,
    "width": 166,
    "height": 34
  },
  "bottomButtons": [...]
}
```

If only Agent/add/create chips are visible, readiness should return `ready: false` instead of continuing.

- [ ] **Step 4: Verify media automation syntax and contracts**

Run:

```powershell
node scripts/check-flow-output-mode-contract.mjs
node scripts/check-flow-chip-classifier.mjs
node --check automation/google-flow-media.mjs
```

Expected: PASS.

---

## Task 4: Persist Better Flow Mode Failure Diagnostics

**Files:**
- Modify: `C:\Users\amd\hermes\automation\google-flow-output-mode.mjs`
- Modify: `C:\Users\amd\hermes\automation\google-flow-media.mjs`
- Modify: `C:\Users\amd\hermes\workflow-db-events.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-desktop-progress-feedback.mjs`

- [ ] **Step 1: Add selected chip details to mode switch results**

Ensure `scene_N_flow_mode_switch.json` includes:

```json
{
  "selectedChip": {
    "label": "Nano Banana Pro crop_9_16 1x",
    "score": 160,
    "x": 729,
    "y": 646
  },
  "rejectedChipReasons": [
    { "label": "에이전트", "reason": "agent-chip" },
    { "label": "arrow_forward 만들기", "reason": "create-chip" }
  ]
}
```

Implementation detail: `chooseFlowGeneratorChip` may expose `classifyFlowChip(item)` returning `{ eligible, reason, score }`, or the page evaluation can derive rejection reasons from helper predicates.

- [ ] **Step 2: Make mismatch error actionable**

When final verification still fails, include the selected chip label in the error details:

```js
details: {
  eventType: "flow-mode-mismatch",
  requestedOutputMode: outputMode,
  selectedOutputMode: finalModeVerification.selectedOutputMode,
  selectedChipLabel: modeSwitchResult?.selectedChip?.label || "",
  rejectedChipReasons: modeSwitchResult?.rejectedChipReasons || [],
  bottomButtons: finalModeVerification.bottomGeneratorChip,
}
```

This prevents future “5%에서 멈춤” cases from requiring manual JSON archaeology.

- [ ] **Step 3: Mirror chip diagnostics through the existing DB event path**

Do not call `bot_db_helper.py` directly from `youtube-workflow-stages.mjs`. The current architecture already mirrors workflow events through `workflow-db-events.mjs`, so keep the failure data on the event details object and ensure the DB failure payload preserves it:

```js
const failurePayload = JSON.stringify({
  type: event.type || "",
  phase: event.phase || "",
  status: event.status || "",
  message: event.message || "",
  failureCode,
  details: event.details || {},
  selectedChipLabel: event.details?.selectedChipLabel || "",
  rejectedChipReasons: event.details?.rejectedChipReasons || [],
  bottomButtons: event.details?.bottomButtons || [],
  updatedAt: event.updatedAt || new Date().toISOString(),
});
```

In `scripts/check-desktop-progress-feedback.mjs`, add:

```js
assert.match(workflowDbEvents, /selectedChipLabel/, "DB failure payload should preserve the clicked Flow chip label");
assert.match(workflowDbEvents, /rejectedChipReasons/, "DB failure payload should preserve rejected Flow chip reasons");
```

- [ ] **Step 4: Verify diagnostics exist**

Run a dry contract:

```powershell
node scripts/check-flow-output-mode-contract.mjs
node scripts/check-desktop-progress-feedback.mjs
```

Expected: PASS and source contains `selectedChipLabel` and `rejectedChipReasons`.

---

## Task 5: Repackage and Run a Real Flow Video Smoke

**Files:**
- Use packaged app and desktop workflow.

- [ ] **Step 1: Run the full checks**

```powershell
npm.cmd run check
```

Expected: PASS.

- [ ] **Step 2: Stop old packaged processes**

```powershell
Get-Process | Where-Object { $_.Path -like 'C:\Users\amd\hermes\dist-electron\win-unpacked\*' } | Stop-Process -Force
```

Expected: no old Hermes packaged process remains.

- [ ] **Step 3: Rebuild packaged app**

```powershell
npm.cmd run electron:pack
node scripts/check-packaged-render-runner.mjs
node scripts/check-packaged-auth-account-switching.mjs
node scripts/check-desktop-shortcut-launcher.mjs
```

Expected: PASS.

- [ ] **Step 4: Real workflow regression**

Run a short keyword job through Hermes Studio:

- keyword: `최신 gemini 소식`
- `flowOutputMode: hybrid`
- `hybridIntroVideoSceneCount: 1`
- mock media: off
- upload: off

Expected artifacts:

- `scene_1_flow_generator_ready.json` has `generatorChip.label` containing `Nano Banana` or `Veo`, not `에이전트`.
- `scene_1_flow_mode_switch.json` first clicked chip is the model/settings chip, not Agent.
- `scene_1_flow_mode_verification.json` reports `selectedOutputMode: "video"`.
- no `scene_1_flow_mode_mismatch.png`.

If Flow UI exposes a separate `tune/settings` button before model text is visible, the selected chip may be `tune 설정`, but the subsequent verification must still reach `selectedOutputMode: "video"`.

---

## Acceptance Criteria

- The failed-job bottom bar fixture selects `Nano Banana Pro crop_9_16 1x`, never `에이전트`.
- Both `google-flow-output-mode.mjs` and `google-flow-media.mjs` use the same chip classification rules.
- `scene_1_flow_generator_ready.json` no longer reports Agent as `generatorChip`.
- Hybrid scene 1 can switch from Nano Banana Pro image mode to Flow video mode.
- If Flow cannot switch modes, diagnostics include the selected chip label and rejected chip reasons.
- Browser-side classifier evaluation errors are returned as JSON diagnostics with `FLOW_CHIP_CLASSIFIER_EVAL_FAILED`.
- Model matching supports versioned labels such as `Veo 3.2` and `Imagen 4`.
- SQLite mirrored failure payloads preserve `selectedChipLabel` and `rejectedChipReasons` through the existing workflow event path.
- `npm.cmd run check` passes.
- `npm.cmd run electron:pack` passes after old packaged processes are stopped.
