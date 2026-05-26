# Flow Image Mode Actual Video Selection Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the bug where Hermes receives `flowOutputMode: "image"` but Google Flow remains in video generation mode.

**Architecture:** Treat Google Flow mode selection as a verified state transition, not a best-effort click. The automation must open the actual bottom generator settings chip, select image mode inside that generator menu, verify the resulting Flow UI state, and stop before prompt submission if the UI still says video.

**Tech Stack:** Node.js ESM, Playwright persistent Chrome context, Electron renderer progress UI, existing Hermes workflow tests.

---

## Confirmed Root Cause

The user's observation is correct.

Latest inspected job:

`C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779769182837`

Evidence:

- `job-request.json` contains `"flowOutputMode": "image"`, so the Electron UI and workflow request were correct.
- Screenshot `scene_1_flow_submitted.png` shows Google Flow still in video mode:
  - Left sidebar selected item: `동영상`
  - Bottom generator chip: `동영상 1x`
  - Media card: `Untitled`, `동영상`, `00:10:00`
- `scene_1_flow_submit_state.json` also contains video-mode text:
  - `Untitled`
  - `동영상`
  - `00:10:00`
  - video playback controls
- `scene_1_flow.jpg` and `scene_2_flow.jpg` being present does not prove image generation. Those files may be Flow video thumbnails or preview images.

Therefore the failure is not in Electron request propagation. The failure is inside `automation/google-flow-output-mode.mjs`: it attempts to switch modes but does not prove that Google Flow actually switched from video to image.

## Why The Current Code Fails

Current file:

`automation/google-flow-output-mode.mjs`

Problems:

- `configureFlowOutputMode(page, "image")` calls `configureFlowImage(page)`, but the returned result is not checked by `automation/google-flow-media.mjs`.
- `configureFlowGenerator()` returns `ok: results.some((item) => item.ok)`, which can be true even if only opening the menu worked and the actual image target click failed.
- `allowGeneratorFallback: true` in image mode can mask failure to select an image model.
- The selector searches broad text such as `image` and mojibake Korean text across many elements. It can match the left media/library sidebar or unrelated text, not the actual generator output mode control.
- There is no saved `before` / `after` mode verification artifact, so the console cannot explain that Flow stayed in video mode.

## Review Validation From `HERMES_FLOW_IMAGE_MODE_FIX_REVIEW.md`

I reviewed `HERMES_FLOW_IMAGE_MODE_FIX_REVIEW.md` against the current codebase and the captured Flow screenshot evidence.

Valid items to include:

- **Force Playwright locale to `ko-KR`:** Valid. Flow labels vary by account/browser locale, and this code already depends on visible text such as image/video/model labels. Setting `locale: "ko-KR"` in `chromium.launchPersistentContext()` reduces selector drift.
- **One bounded reload retry:** Valid with limits. A single reload/retry before failing can recover transient Flow panel/menu state. It must not become an indefinite retry loop, and it must still save mismatch evidence if retry fails.
- **DB/diagnose integration:** Valid. `workflow-db-events.mjs` already mirrors failed workflow events into SQLite `task_failures`, so the plan should emit a clear failed workflow event with `eventType: "flow-mode-mismatch"`, `requestedOutputMode`, and `selectedOutputMode`.

Items not included as immediate requirements:

- **Do not write verification JSON on success:** Not accepted for this fix. This bug is a state-verification bug, so successful runs need lightweight proof while the feature stabilizes. We can revisit artifact pruning later, but for now `scene_N_flow_mode_verification.json` is required for both success and failure.
- **Directly changing SQLite schema:** Not needed. The existing `task_failures.error_msg` payload and `task_events.data_json` can already store the mismatch JSON.

## File Map

- Modify `automation/google-flow-output-mode.mjs`: Implement strict image/video mode switching and verification.
- Modify `automation/google-flow-media.mjs`: Force `ko-KR` locale, save mode verification JSON/screenshots, perform one bounded reload retry, and throw before prompt submission when mode mismatch remains.
- Modify `workflow-db-events.mjs`: Ensure `flow-mode-mismatch` failed events are mirrored to SQLite `task_failures`.
- Modify `scripts/check-flow-output-mode-contract.mjs`: Add regression checks for strict verification and no `some()` success.
- Modify `scripts/check-desktop-progress-feedback.mjs`: Ensure UI reports mode mismatch as an actionable error.
- Modify `docs/superpowers/plans/2026-05-26-flow-image-mode-debug-and-ux-plan.md`: Mark the previous `.jpg means image worked` interpretation as insufficient and point to this root-cause plan.

---

### Task 1: Make The Contract Test Fail For The Current Bug

**Files:**
- Modify: `scripts/check-flow-output-mode-contract.mjs`

- [ ] **Step 1: Add strict verification assertions**

Add these assertions near the existing Flow output mode assertions:

```js
assert.match(outputModeHelper, /verifyFlowOutputMode/, "Flow output helper must verify the selected mode after clicking");
assert.match(outputModeHelper, /requestedOutputMode/, "verification must report requested output mode");
assert.match(outputModeHelper, /selectedOutputMode/, "verification must report selected output mode");
assert.match(outputModeHelper, /bottomGeneratorChip/, "mode selection must target the bottom generator chip, not the sidebar");
assert.match(flow, /locale:\s*["']ko-KR["']/, "Flow browser context should force ko-KR locale for stable labels");
assert.match(flow, /retryFlowOutputModeAfterReload/, "Flow automation should have one bounded reload retry for transient mode-switch failures");
assert.doesNotMatch(outputModeHelper, /results\.some\(\(item\) => item\.ok\)/, "mode switching must not pass just because any click succeeded");
assert.doesNotMatch(outputModeHelper, /allowGeneratorFallback:\s*true/, "image mode must not silently continue when image model selection is not verified");
assert.match(flow, /flow_mode_verification/, "Flow automation must save mode verification artifacts");
```

- [ ] **Step 2: Run the test and confirm failure**

Run:

```powershell
node scripts/check-flow-output-mode-contract.mjs
```

Expected: FAIL until strict verification is implemented.

---

### Task 2: Replace Best-Effort Mode Switching With Verified Mode Switching

**Files:**
- Modify: `automation/google-flow-output-mode.mjs`

- [ ] **Step 1: Export a verification function**

Add:

```js
export async function verifyFlowOutputMode(page, requestedOutputMode) {
  return page.evaluate((requested) => {
    const text = document.body?.innerText || "";
    const bottomControls = Array.from(document.querySelectorAll("button,[role='button']"))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const label = [el.innerText, el.textContent, el.getAttribute("aria-label"), el.getAttribute("title")]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        return { label, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })
      .filter((item) => item.y > window.innerHeight * 0.68 && item.width > 20 && item.height > 20);

    const bottomText = bottomControls.map((item) => item.label).join("\n");
    const hasVideoChip = /동영상|video|Veo|00:10:00|videocam/i.test(`${bottomText}\n${text}`);
    const hasImageChip = /이미지|image|Nano Banana|Imagen|photo|image/i.test(bottomText);

    const selectedOutputMode = hasImageChip && !hasVideoChip
      ? "image"
      : hasVideoChip
        ? "video"
        : "unknown";

    return {
      requestedOutputMode: requested,
      selectedOutputMode,
      ok: selectedOutputMode === requested,
      bottomGeneratorChip: bottomControls,
      textTail: text.slice(-1500),
    };
  }, requestedOutputMode);
}
```

- [ ] **Step 2: Implement bottom generator chip opener**

Replace broad `openGeneratorMenu()` with a function that only targets the lower prompt generator chip:

```js
const openBottomGeneratorChip = async () => {
  const candidates = controls()
    .filter((item) => {
      const text = item.text;
      return item.el.matches("button,[role='button']")
        && item.rect.y > window.innerHeight * 0.68
        && item.rect.x > window.innerWidth * 0.45
        && /동영상|이미지|video|image|Veo|Nano Banana|Imagen|1x|crop_9_16/i.test(text);
    })
    .sort((a, b) => {
      const aMode = /동영상|이미지|video|image/i.test(a.text) ? 1 : 0;
      const bMode = /동영상|이미지|video|image/i.test(b.text) ? 1 : 0;
      return bMode - aMode || b.rect.width * b.rect.height - a.rect.width * a.rect.height;
    });
  const target = candidates[0];
  if (!target) return { ok: false, reason: "bottom generator chip not found" };
  target.el.click();
  await wait(600);
  return { ok: true, text: target.text, bottomGeneratorChip: true };
};
```

- [ ] **Step 3: Select mode inside the opened generator menu only**

Update `clickMatch()` so image/video mode choices can be selected from the popover, but not from the left sidebar:

```js
if (options.generatorMenuOnly) {
  const inSidebar = item.rect.x < window.innerWidth * 0.25;
  const tooHighForMenu = item.rect.y < window.innerHeight * 0.35;
  if (inSidebar || tooHighForMenu) return false;
}
```

Call:

```js
const targetResult = await clickMatch(config.targetLabels, { generatorMenuOnly: true });
```

- [ ] **Step 4: Require all critical steps to pass**

Change final return from:

```js
return { ok: results.some((item) => item.ok), results, summary: bodyText().slice(-500) };
```

to:

```js
const criticalResults = results.filter((item) => !item.optional);
return {
  ok: criticalResults.every((item) => item.ok),
  results,
  summary: bodyText().slice(-800),
};
```

- [ ] **Step 5: Remove silent image fallback**

Delete `allowGeneratorFallback: true` from `configureFlowImage()`. Image mode must fail loudly when image model selection cannot be verified.

---

### Task 3: Stop Before Prompt Submission If Flow Still Shows Video

**Files:**
- Modify: `automation/google-flow-media.mjs`

- [ ] **Step 1: Force Korean locale in the Flow browser context**

In `automation/google-flow-media.mjs`, change:

```js
const context = await chromium.launchPersistentContext(profileDir, {
  executablePath: chromePath,
  headless: false,
  acceptDownloads: true,
  args: ["--no-first-run", "--no-default-browser-check"],
});
```

to:

```js
const context = await chromium.launchPersistentContext(profileDir, {
  executablePath: chromePath,
  headless: false,
  locale: "ko-KR",
  acceptDownloads: true,
  args: ["--no-first-run", "--no-default-browser-check"],
});
```

This does not replace English fallback selectors; it only stabilizes the default Google Flow UI language.

- [ ] **Step 2: Import verification**

Change:

```js
import { configureFlowOutputMode } from "./google-flow-output-mode.mjs";
```

to:

```js
import { configureFlowOutputMode, verifyFlowOutputMode } from "./google-flow-output-mode.mjs";
```

- [ ] **Step 3: Save mode switch result and screenshot**

Replace:

```js
await configureFlowOutputMode(page, outputMode);
```

with:

```js
const modeSwitchResult = await configureFlowOutputMode(page, outputMode);
await writeFile(
  join(jobDir, `scene_${sceneOrder}_flow_mode_switch.json`),
  JSON.stringify(modeSwitchResult, null, 2),
  "utf8",
);
await page.screenshot({
  path: join(jobDir, `scene_${sceneOrder}_flow_mode_after_click.png`),
  fullPage: true,
}).catch(() => {});
```

- [ ] **Step 4: Add one bounded reload retry**

Add this helper inside `generateGoogleFlowVideoFromPrompt()` before the first mode switch:

```js
const retryFlowOutputModeAfterReload = async ({ reason }) => {
  await writeFile(
    join(jobDir, `scene_${sceneOrder}_flow_mode_retry.json`),
    JSON.stringify({ reason, requestedOutputMode: outputMode, updatedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await ensureFlowProject(page);
  const retrySwitchResult = await configureFlowOutputMode(page, outputMode);
  const retryVerification = await verifyFlowOutputMode(page, outputMode);
  await writeFile(
    join(jobDir, `scene_${sceneOrder}_flow_mode_retry_verification.json`),
    JSON.stringify({ retrySwitchResult, retryVerification, updatedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
  return { retrySwitchResult, retryVerification };
};
```

The retry is limited to one reload. Do not add more retries in this task.

- [ ] **Step 5: Verify the actual Flow mode**

Immediately after the screenshot:

```js
const modeVerification = await verifyFlowOutputMode(page, outputMode);
await writeFile(
  join(jobDir, `scene_${sceneOrder}_flow_mode_verification.json`),
  JSON.stringify(modeVerification, null, 2),
  "utf8",
);

let finalModeSwitchResult = modeSwitchResult;
let finalModeVerification = modeVerification;

if (!modeSwitchResult.ok || !modeVerification.ok) {
  const retryResult = await retryFlowOutputModeAfterReload({
    reason: `initial mismatch: requested=${outputMode}, selected=${modeVerification.selectedOutputMode}`,
  });
  finalModeSwitchResult = retryResult.retrySwitchResult;
  finalModeVerification = retryResult.retryVerification;
}

if (!finalModeSwitchResult.ok || !finalModeVerification.ok) {
  await page.screenshot({
    path: join(jobDir, `scene_${sceneOrder}_flow_mode_mismatch.png`),
    fullPage: true,
  }).catch(() => {});
  throw new Error(
    `Google Flow output mode mismatch. Requested ${outputMode}, but Flow UI appears to be ${finalModeVerification.selectedOutputMode}. Check scene_${sceneOrder}_flow_mode_mismatch.png.`,
  );
}
```

- [ ] **Step 6: Run the contract test**

Run:

```powershell
node scripts/check-flow-output-mode-contract.mjs
```

Expected: PASS.

---

### Task 4: Make The Console Error Actionable

**Files:**
- Modify: `scripts/check-desktop-progress-feedback.mjs`
- Modify: `electron/renderer/app.js`
- Modify: `youtube-workflow-stages.mjs`
- Modify: `workflow-db-events.mjs`

- [ ] **Step 1: Add progress contract**

In `scripts/check-desktop-progress-feedback.mjs`, add:

```js
assert.match(stages, /Google Flow output mode mismatch|Flow UI appears to be/, "workflow should expose Flow mode mismatch");
assert.match(renderer, /flow_mode_mismatch|mode_mismatch|output mode mismatch/i, "console should preserve Flow mode mismatch details");
assert.match(workflowDbEvents, /flow-mode-mismatch/, "workflow DB mirror should persist Flow mode mismatches to task_failures");
```

- [ ] **Step 2: Emit mismatch details**

When catching Flow automation errors, include:

```js
details: {
  eventType: "flow-mode-mismatch",
  requestedOutputMode: outputMode,
  selectedOutputMode: modeVerification?.selectedOutputMode || "unknown",
  sceneOrder: scene.order,
}
```

- [ ] **Step 3: Ensure DB failure mirroring recognizes the mismatch**

In `workflow-db-events.mjs`, update `isFailureEvent(event = {})`:

```js
function isFailureEvent(event = {}) {
  return event.type === "desktop-job-failed"
    || event.details?.eventType === "flow-mode-mismatch"
    || event.status === "failed"
    || /failed|failure|Gpu Cache Creation failed|disk_cache|Unable to move the cache/i.test(String(event.message || ""));
}
```

This uses the existing `bot_db_helper.py log-failure` path and does not require a SQLite schema change.

- [ ] **Step 4: Render helpful console text**

In `electron/renderer/app.js`, when `event.details.eventType === "flow-mode-mismatch"`, show:

```js
"Google Flow가 요청한 이미지/영상 모드로 전환되지 않았습니다. 인증 브라우저에서 해당 장면의 mode_mismatch 스크린샷을 확인하세요."
```

---

### Task 5: Update The Previous Plan With Correct Interpretation

**Files:**
- Modify: `docs/superpowers/plans/2026-05-26-flow-image-mode-debug-and-ux-plan.md`

- [ ] **Step 1: Add correction note near Root Cause Evidence**

Add:

```markdown
Correction: A `.jpg` Flow artifact alone does not prove Flow image mode worked. Google Flow video mode can expose thumbnails or preview images. The reliable evidence is the Flow UI state after mode selection. In job `youtube-1779769182837`, the screenshot showed `동영상`, `동영상 1x`, and `00:10:00`, so the actual root cause is failed mode switching, covered by `2026-05-26-flow-image-mode-actual-video-selection-fix-plan.md`.
```

---

### Task 6: Verify With A Real Manual Run

**Files:**
- Runtime artifacts under `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-*`

- [ ] **Step 1: Rebuild packaged app**

Run:

```powershell
Get-Process | Where-Object { $_.ProcessName -eq "Hermes YouTube Studio" } | Stop-Process -Force
npm.cmd run electron:pack
node scripts/check-packaged-runtime-contract.mjs
node scripts/check-desktop-shortcut-launcher.mjs
```

Expected: all commands pass.

- [ ] **Step 2: Launch from desktop shortcut**

Run the desktop shortcut manually.

- [ ] **Step 3: Submit a real Image mode job**

Use:

```text
sourceType: keyword
sourceValue: 구글 글래스
flowOutputMode: image
```

- [ ] **Step 4: Verify scene 1 before generation proceeds**

Expected artifacts:

```text
scene_1_flow_mode_switch.json
scene_1_flow_mode_verification.json
scene_1_flow_mode_after_click.png
```

Expected verification:

```json
{
  "requestedOutputMode": "image",
  "selectedOutputMode": "image",
  "ok": true
}
```

- [ ] **Step 5: If Flow still shows video, fail before prompt submission**

Expected behavior:

- No prompt is submitted to Flow.
- Console shows `Google Flow output mode mismatch`.
- Artifact `scene_1_flow_mode_mismatch.png` shows the incorrect Flow UI state.

---

## Acceptance Criteria

- Image mode cannot continue if Flow UI still displays `동영상`, `Veo`, `video`, or `00:10:00`.
- `configureFlowOutputMode()` only returns `ok: true` when every critical click and verification step succeeds.
- The automation never treats a random `.jpg` media candidate as proof that image mode was selected.
- Each real job saves mode switch and verification artifacts before prompt submission.
- The Flow browser context launches with `locale: "ko-KR"` while keeping English selector fallbacks.
- A transient mode mismatch gets exactly one reload retry; a second mismatch fails fast with screenshots and JSON evidence.
- `flow-mode-mismatch` failures are mirrored to SQLite through the existing `workflow-db-events.mjs` and `bot_db_helper.py log-failure` path.
- If Google Flow changes its UI, the app fails early with a useful screenshot instead of silently generating a video.
