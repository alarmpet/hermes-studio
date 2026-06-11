# Flow Nano Banana Pro Credit Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hermes reliably enter Google Flow image generation, select Nano Banana Pro when requested, set 16:9 and one image, and reject any credit-spend confirmation instead of approving it.

**Architecture:** Keep Google Flow as a deterministic Playwright workflow, not an autonomous browser agent. Split the fix into four contracts: project entry, image-settings selection, credit confirmation policy, and evidence-rich verification. Every UI setting must be verified from saved artifacts before submission.

**Tech Stack:** Electron, Playwright, Google Flow Web UI automation, Node.js contract scripts, Hermes scene media manifest/final QA.

---

## Investigation Findings

- Diagnostic 1: `C:/Users/amd/AppData/Roaming/hermes/outputs/desktop/flow-settings-diagnostic-1781179992405`
  - Flow auth profile was logged in.
  - Current URL stayed on `https://labs.google/fx/ko/tools/flow`.
  - Page was the project list, not the generator.
  - `configureFlowOutputMode(image, 16:9)` failed because no generator/settings chip existed.

- Diagnostic 2: `C:/Users/amd/AppData/Roaming/hermes/outputs/desktop/flow-project-settings-diagnostic-1781180053127`
  - The visible new-project button text was `add_2 새 프로젝트 add_2새 프로젝트`.
  - The temporary diagnostic using literal Korean did not click it, confirming that automation should not depend only on localized literal text.

- Diagnostic 3: `C:/Users/amd/AppData/Roaming/hermes/outputs/desktop/flow-project-add2-diagnostic-1781180144045`
  - Clicking `add_2` opened `/project/49a70a42-e51a-46a3-8f3c-09b78339bcc0`.
  - Settings panel was applied and saved.
  - Image model selected was `Nano Banana 2`, not `Nano Banana Pro`.
  - `16:9` was clicked successfully.
  - `1x` was not found; current code treats that as optional.
  - Post-save `verifyFlowOutputMode()` returned `selectedOutputMode:"unknown"` because the visible bottom chip after save was `tune 설정`, not a model chip.

## Root Causes

1. `ensureFlowProject()` does not include `add_2` / create-icon matching even though current Flow exposes the new project control that way.
2. `automation/google-flow-output-mode.mjs` explicitly excludes `Nano Banana Pro`:
   - `imageModel: ["Imagen 4", "Nano Banana 2"]`
   - `excludeGeneratorLabels: ["Nano Banana Pro"]`
3. The credit policy only rejects 15-credit video confirmations. General generation confirmations are auto-approved through `approveFlowGenerationConfirmation()`, which is unsafe for paid/pro image flows.
4. Verification after saved settings is too weak. `modeStateFromSavedSettingsPanel()` can mark output mode as OK without carrying the selected image model, aspect ratio, or count from the saved panel result.
5. Image count selection is optional and not persisted in diagnostics, so `1장/1x` can silently fail.

## File Map

- Modify: `automation/google-flow-media.mjs`
  - Project entry selector hardening.
  - Replace general approval behavior with credit-aware reject/allow policy.
  - Attach settings verification evidence to Flow status files.

- Modify: `automation/google-flow-output-mode.mjs`
  - Add configurable image model preference.
  - Support `Nano Banana Pro`.
  - Persist selected model/aspect/count from settings-panel application.
  - Make `1x` selection observable.

- Modify: `electron/renderer/index.html`
  - Add explicit Flow image model selector if missing.
  - Add explicit “reject paid credit confirmations” UI copy/control if needed.

- Modify: `electron/renderer/app.js`
  - Include `flowImageModel` and `rejectPaidFlowCredits` in job options.

- Modify: `youtube-job-schema.mjs`
  - Normalize `flowImageModel`, defaulting to `nano-banana-pro`.
  - Normalize `rejectPaidFlowCredits`, defaulting to `true`.

- Modify: `scripts/check-flow-output-mode-contract.mjs`
  - Contract for Nano Banana Pro preference, 16:9, and count evidence.

- Create: `scripts/check-flow-credit-confirmation-guard.mjs`
  - Static/fixture contract that paid credit confirmations are rejected for image and video.

- Create: `scripts/check-flow-project-entry-add2.mjs`
  - Contract that `add_2` is accepted as the new-project entry control.

## Task 1: Project Entry Guard

**Files:**
- Modify: `automation/google-flow-media.mjs`
- Create: `scripts/check-flow-project-entry-add2.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add failing contract for `add_2` project entry**

Create `scripts/check-flow-project-entry-add2.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const flow = readFileSync(resolve(root, "automation/google-flow-media.mjs"), "utf8");
const packageJson = readFileSync(resolve(root, "package.json"), "utf8");

assert.match(flow, /"add_2"/, "Flow project entry should match the current add_2 new-project control");
assert.match(flow, /Flow project start button not found/, "Flow project entry failure should remain diagnosable");
assert.match(packageJson, /check-flow-project-entry-add2\.mjs/, "package checks should include add_2 project entry regression");

console.log(JSON.stringify({ ok: true, checked: "flow-project-entry-add2" }));
```

- [ ] **Step 2: Run the failing contract**

Run:

```powershell
node scripts\check-flow-project-entry-add2.mjs
```

Expected before implementation:

```text
AssertionError: Flow project entry should match the current add_2 new-project control
```

- [ ] **Step 3: Harden project entry selector**

In `automation/google-flow-media.mjs`, inside `ensureFlowProject()`, update the `words` list:

```js
const words = [
  "add_2",
  "new project",
  "create project",
  "get started",
  "\uc0c8 \ud504\ub85c\uc81d\ud2b8",
  "\uc2dc\uc791",
  "\uc2dc\uc791\ud558\uae30",
];
```

- [ ] **Step 4: Add the contract to `check:flow-policy-safety`**

In `package.json`, append:

```json
" && node scripts/check-flow-project-entry-add2.mjs"
```

to `check:flow-policy-safety`.

- [ ] **Step 5: Verify**

Run:

```powershell
node scripts\check-flow-project-entry-add2.mjs
npm.cmd run check:flow-policy-safety
```

Expected:

```text
{"ok":true,"checked":"flow-project-entry-add2"}
```

## Task 2: Nano Banana Pro Image Settings

**Files:**
- Modify: `automation/google-flow-output-mode.mjs`
- Modify: `youtube-job-schema.mjs`
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Modify: `scripts/check-flow-output-mode-contract.mjs`

- [ ] **Step 1: Add job option normalization**

In `youtube-job-schema.mjs`, normalize:

```js
flowImageModel: ["nano-banana-pro", "nano-banana-2", "imagen"].includes(String(input.options?.flowImageModel || "").toLowerCase())
  ? String(input.options.flowImageModel).toLowerCase()
  : "nano-banana-pro",
rejectPaidFlowCredits: input.options?.rejectPaidFlowCredits !== false,
```

- [ ] **Step 2: Pass model preference into Flow settings**

Change `configureFlowOutputMode()` signature in `automation/google-flow-output-mode.mjs`:

```js
export async function configureFlowOutputMode(page, outputMode = "video", aspectRatio = "9:16", options = {}) {
  if (outputMode === "image") return configureFlowImage(page, aspectRatio, options);
  return configureFlowVideo(page, aspectRatio);
}
```

- [ ] **Step 3: Prefer Nano Banana Pro for image mode**

Add:

```js
const IMAGE_MODEL_LABELS = {
  "nano-banana-pro": ["Nano Banana Pro"],
  "nano-banana-2": ["Nano Banana 2"],
  imagen: ["Imagen 4"],
};
```

Then in `configureFlowImage()`:

```js
async function configureFlowImage(page, aspectRatio = "9:16", options = {}) {
  const requestedImageModel = options.flowImageModel || "nano-banana-pro";
  return configureFlowGenerator(page, {
    requestedOutputMode: "image",
    targetLabels: LABELS.image,
    sectionLabels: LABELS.imageSection,
    modelDropdownLabels: LABELS.imageModelDropdown,
    generatorLabels: IMAGE_MODEL_LABELS[requestedImageModel] || IMAGE_MODEL_LABELS["nano-banana-pro"],
    requestedImageModel,
    modelRequired: true,
    aspectLabels: aspectRatio === "16:9" ? LABELS.landscapeAspect : LABELS.aspect,
    countLabels: LABELS.count,
    countRequired: true,
  });
}
```

Remove `excludeGeneratorLabels: ["Nano Banana Pro"]`.

- [ ] **Step 4: Return selected settings from switch result**

At the end of `configureFlowGenerator()`, derive and return:

```js
const selectedModelResult = results.find((item) => item.ok && /Nano Banana|Imagen/i.test(item.text || ""));
const selectedAspectResult = results.find((item) => item.ok && /16:9|9:16|crop_16_9|crop_9_16/i.test(item.text || ""));
const selectedCountResult = results.find((item) => item.ok && /1x|1\s*(장|image)/i.test(item.text || ""));

return {
  ok: criticalResults.every((item) => item.ok) && menuClosed.ok,
  requestedOutputMode: config.requestedOutputMode,
  requestedImageModel: config.requestedImageModel || "",
  selectedImageModelLabel: selectedModelResult?.text || "",
  selectedAspectLabel: selectedAspectResult?.text || "",
  selectedCountLabel: selectedCountResult?.text || "",
  settingsPanelApplied: true,
  saved: saveResult.ok,
  menuClosed,
  sectionBounds,
  results,
  selectedChip: [...results].reverse().find((item) => item.selectedChip)?.selectedChip,
  rejectedChipReasons: results.flatMap((item) => item.rejectedChipReasons || []),
  summary: await pageSummary(),
};
```

- [ ] **Step 5: Make count required for the requested workflow**

Update:

```js
results.push(await clickMatch(config.countLabels, { ...scoped, exact: true, optional: !config.countRequired }));
```

- [ ] **Step 6: UI option**

In `electron/renderer/index.html`, near Flow output mode controls, add:

```html
<label>Flow 이미지 모델</label>
<select id="flowImageModel">
  <option value="nano-banana-pro" selected>Nano Banana Pro</option>
  <option value="nano-banana-2">Nano Banana 2</option>
  <option value="imagen">Imagen 4</option>
</select>
```

In `electron/renderer/app.js`, bind and submit:

```js
const flowImageModelInput = document.querySelector("#flowImageModel");
```

and in the job options payload:

```js
flowImageModel: flowImageModelInput?.value || "nano-banana-pro",
```

- [ ] **Step 7: Verify contracts**

Update `scripts/check-flow-output-mode-contract.mjs` to assert:

```js
assert.match(outputModeHelper, /Nano Banana Pro/, "image mode should support Nano Banana Pro");
assert.doesNotMatch(outputModeHelper, /excludeGeneratorLabels:\s*\[\s*"Nano Banana Pro"\s*\]/, "Nano Banana Pro should not be excluded");
assert.match(outputModeHelper, /countRequired/, "image mode should require count verification when requested");
assert.match(outputModeHelper, /selectedCountLabel/, "Flow settings result should preserve selected count evidence");
```

Run:

```powershell
npm.cmd run check:flow-output-mode
```

Expected:

```text
{"ok":true,"checked":"flow-output-mode-contract"}
```

## Task 3: Reject Paid Credit Confirmations

**Files:**
- Modify: `automation/google-flow-media.mjs`
- Create: `scripts/check-flow-credit-confirmation-guard.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add failing credit guard contract**

Create `scripts/check-flow-credit-confirmation-guard.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const flow = readFileSync(resolve(root, "automation/google-flow-media.mjs"), "utf8");
const packageJson = readFileSync(resolve(root, "package.json"), "utf8");

assert.match(flow, /rejectPaidFlowCreditConfirmation/, "Flow automation should reject paid credit confirmations for any mode");
assert.match(flow, /FLOW_PAID_CREDIT_CONFIRMATION_REJECTED/, "Flow automation should expose a structured paid-credit rejection code");
assert.doesNotMatch(flow, /const approval = await approveFlowGenerationConfirmation\(page\);[\s\S]{0,220}approval\.approved/, "Flow automation should not auto-approve generic credit confirmations");
assert.match(packageJson, /check-flow-credit-confirmation-guard\.mjs/, "package checks should include paid credit guard");

console.log(JSON.stringify({ ok: true, checked: "flow-credit-confirmation-guard" }));
```

- [ ] **Step 2: Replace video-only rejector with paid-credit rejector**

In `automation/google-flow-media.mjs`, add:

```js
async function rejectPaidFlowCreditConfirmation(page) {
  const state = await page.evaluate(() => {
    const bodyText = document.body?.innerText || "";
    const paidCreditOpen = /(\ud06c\ub808\ub527|credit).*(\uc0ac\uc6a9|use)|(\uc0dd\uc131|generation).*(\ud06c\ub808\ub527|credit)|15\uac1c|15\s*credits/i.test(bodyText);
    if (!paidCreditOpen) return { open: false, rejected: false, reason: "no-paid-credit-confirmation" };
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
    const target = Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(visible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          el,
          text: textOf(el),
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
        };
      })
      .filter((item) => /(\uac70\ubd80|reject|decline|cancel)/i.test(item.text))
      .sort((a, b) => a.x - b.x || b.y - a.y)[0];
    if (!target) return { open: true, rejected: false, reason: "reject-button-not-found", bodyTail: bodyText.slice(-800) };
    target.el.click();
    const { el, ...targetInfo } = target;
    return { open: true, rejected: true, target: targetInfo };
  }).catch((error) => ({ open: false, rejected: false, reason: error?.message || String(error) }));
  if (state.rejected) await delay(900);
  return state;
}
```

- [ ] **Step 3: Use paid-credit rejector before approval**

Inside `verifyFlowSubmissionStarted()` replace the video-only guard:

```js
const rejection = await rejectPaidFlowCreditConfirmation(page);
if (rejection.rejected) {
  const screenshotPath = join(jobDir, `scene_${sceneOrder}_flow_paid_credit_rejected.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  await writeFile(join(jobDir, `scene_${sceneOrder}_flow_paid_credit_rejected.json`), JSON.stringify({
    ok: true,
    outputMode,
    accountSlotId,
    rejection,
    screenshotPath,
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8").catch(() => {});
  const error = new Error(`FLOW_PAID_CREDIT_CONFIRMATION_REJECTED: Scene ${sceneOrder} generation requires paid credits and was rejected. Screenshot: ${screenshotPath}`);
  error.failureCode = "FLOW_PAID_CREDIT_CONFIRMATION_REJECTED";
  error.actionRequired = false;
  error.retryable = true;
  error.details = {
    failureCode: "FLOW_PAID_CREDIT_CONFIRMATION_REJECTED",
    actionRequired: false,
    retryable: true,
    sceneOrder,
    outputMode,
    accountSlotId,
    screenshotPath,
    rejection,
  };
  throw error;
}
```

Then allow `approveFlowGenerationConfirmation()` only for non-credit confirmations by requiring the probe to report no credit text before clicking.

- [ ] **Step 4: Add contract to checks**

Append to `check:flow-policy-safety`:

```json
" && node scripts/check-flow-credit-confirmation-guard.mjs"
```

- [ ] **Step 5: Verify**

Run:

```powershell
node scripts\check-flow-credit-confirmation-guard.mjs
npm.cmd run check:flow-policy-safety
```

Expected:

```text
{"ok":true,"checked":"flow-credit-confirmation-guard"}
```

## Task 4: Settings Verification Evidence

**Files:**
- Modify: `automation/google-flow-media.mjs`
- Modify: `scripts/check-web-ui-provider-manifest-contract.mjs`

- [ ] **Step 1: Carry switch-result settings into final verification**

Update `modeStateFromSavedSettingsPanel()` to accept the switch result:

```js
function modeStateFromSavedSettingsPanel(modeState, outputMode, switchResult = {}) {
  if (modeState.selectedOutputMode !== "unknown" || modeState.generatorMenuOpen) return modeState;
  return {
    ...modeState,
    selectedOutputMode: outputMode,
    selectedImageModel: switchResult.requestedImageModel || modeState.selectedImageModel,
    selectedImageModelLabel: switchResult.selectedImageModelLabel || "",
    selectedAspectRatio: /16:9/.test(switchResult.selectedAspectLabel || "") ? "16:9" : modeState.requestedAspectRatio || modeState.selectedAspectRatio,
    selectedCountLabel: switchResult.selectedCountLabel || "",
    ok: true,
    settingsPanelApplied: true,
    saved: true,
    reason: "Google Flow settings panel was applied and saved; verification is based on saved settings evidence.",
  };
}
```

- [ ] **Step 2: Pass switch result at all call sites**

Replace:

```js
modeStateFromSavedSettingsPanel(modeVerification, outputMode)
```

with:

```js
modeStateFromSavedSettingsPanel(modeVerification, outputMode, finalModeSwitchResult)
```

- [ ] **Step 3: Persist effective settings status**

After final mode verification succeeds, write:

```js
await writeFile(join(jobDir, `scene_${sceneOrder}_flow_effective_settings.json`), JSON.stringify({
  requestedOutputMode: outputMode,
  requestedAspectRatio: aspectRatio,
  requestedImageModel: jobOptions?.flowImageModel || "",
  modeSwitchResult: finalModeSwitchResult,
  modeVerification: finalModeVerification,
  updatedAt: new Date().toISOString(),
}, null, 2), "utf8");
```

- [ ] **Step 4: Verify**

Run:

```powershell
npm.cmd run check:web-ui-automation
npm.cmd run check:flow-output-mode
```

Expected:

```text
{"ok":true,"checked":"web-ui-provider-manifest-contract"}
{"ok":true,"checked":"flow-output-mode-contract"}
```

## Task 5: Live No-Spend Smoke

**Files:**
- Create: `scripts/smoke-flow-settings-no-spend.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add smoke script that never clicks final submit**

Create `scripts/smoke-flow-settings-no-spend.mjs` that:

1. Opens the Hermes Flow profile with `createWebUiProviderContext()`.
2. Opens Google Flow.
3. Clicks new project using `add_2`.
4. Calls `configureFlowOutputMode(page, "image", "16:9", { flowImageModel: "nano-banana-pro" })`.
5. Calls `verifyFlowOutputMode(page, "image", "16:9")`.
6. Writes `flow-settings-no-spend-report.json`.
7. Does not fill the prompt.
8. Does not click create/submit.

- [ ] **Step 2: Add npm script**

In `package.json`:

```json
"smoke:flow-settings-no-spend": "node scripts/smoke-flow-settings-no-spend.mjs"
```

- [ ] **Step 3: Run live no-spend smoke**

Run:

```powershell
npm.cmd run smoke:flow-settings-no-spend
```

Expected:

```json
{
  "ok": true,
  "requestedOutputMode": "image",
  "requestedAspectRatio": "16:9",
  "requestedImageModel": "nano-banana-pro",
  "submitted": false
}
```

## Task 6: Packaged App and Shortcut

**Files:**
- Modify: `timeline.md`

- [ ] **Step 1: Run focused checks**

Run:

```powershell
npm.cmd run check:web-ui-automation
npm.cmd run check:flow-output-mode
npm.cmd run check:flow-policy-safety
node scripts\check-desktop-progress-feedback.mjs
```

- [ ] **Step 2: Repack**

Run:

```powershell
npm.cmd run electron:pack
```

- [ ] **Step 3: Verify package and desktop shortcut**

Run:

```powershell
node scripts\check-packaged-runtime-contract.mjs
powershell -ExecutionPolicy Bypass -File scripts\check-shortcut.ps1
```

Expected shortcut output must point to:

```text
C:\Users\amd\hermes\dist-electron\win-unpacked\Hermes YouTube Studio.exe
```

- [ ] **Step 4: Update timeline**

Append one entry to `timeline.md`:

```markdown
## 2026-06-11 - Fix - Flow Nano Banana Pro no-spend settings guard

- Verified the live Flow profile and found the current project list exposes the new-project control as `add_2 새 프로젝트`.
- Added project-entry matching for `add_2`, Nano Banana Pro image selection, count/aspect/model settings evidence, and paid-credit confirmation rejection for image and video.
- Added a no-spend live smoke that verifies Flow settings without submitting generation.
- Verification: `npm.cmd run smoke:flow-settings-no-spend`, `npm.cmd run check:web-ui-automation`, `npm.cmd run check:flow-output-mode`, `npm.cmd run check:flow-policy-safety`, `npm.cmd run electron:pack`, `node scripts/check-packaged-runtime-contract.mjs`, `powershell -ExecutionPolicy Bypass -File scripts/check-shortcut.ps1`.
```

## Acceptance Criteria

- Live no-spend smoke opens Flow project successfully from the project list using `add_2`.
- Effective settings evidence shows:
  - `requestedOutputMode: "image"`
  - `requestedAspectRatio: "16:9"`
  - `requestedImageModel: "nano-banana-pro"`
  - `selectedImageModelLabel` contains `Nano Banana Pro`
  - `selectedAspectRatio: "16:9"`
  - `selectedCountLabel` confirms one image or the UI reports a stable default count of one.
- Any modal containing `credit`, `크레딧`, `15개`, or equivalent paid generation language is rejected and produces `FLOW_PAID_CREDIT_CONFIRMATION_REJECTED`.
- No image/video generation request is submitted during the no-spend smoke.
- Packaged app and desktop shortcut run the updated build.

## Notes

- Do not run a full paid Flow generation until the credit guard contract passes.
- The provided Viking horned-helmet Korean script should be used only after the no-spend smoke proves settings and credit rejection behavior.
- The current diagnostics show that the system can enter the project and save image settings, but it currently selects `Nano Banana 2`, not `Nano Banana Pro`.
