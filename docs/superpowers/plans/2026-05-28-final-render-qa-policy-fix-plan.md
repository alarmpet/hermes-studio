# Final Render QA Policy Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the latest Hermes Studio job failure where the final MP4 was successfully rendered, but final output QA incorrectly failed the job with `HARD_FREEZE_RISK`.

**Architecture:** Keep final render and final output QA as separate stages, but make both use the same duration/freeze policy. `scripts/render-duration-policy.mjs` should remain the source of truth for deciding whether a video/audio mismatch is acceptable, warning-only, or regeneration-required. `scripts/analyze-youtube-output.mjs` should consume that policy instead of using a conflicting hard-coded `ratio > 1.3` rule.

**Tech Stack:** Node ESM, Electron packaged workflow, ffmpeg render reports, Hermes check scripts.

---

## Confirmed Findings

Latest job inspected:

```text
C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779904137210
```

The job did **not** fail because the renderer could not produce a video. The final video exists:

```text
C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779904137210\desktop-flow-1779904137283.mp4
```

`render-report-v2.json` says:

```json
{
  "ok": true,
  "finalDuration": 56.67,
  "subtitleEnd": 56.63,
  "freezeRisk": "low",
  "requiresRegeneration": false
}
```

The actual failure is in `desktop-failure.json`:

```text
Final output QA failed: HARD_FREEZE_RISK
```

Scene 1 details:

```json
{
  "order": 1,
  "videoDuration": 8,
  "audioDuration": 11.35,
  "ratio": 1.419,
  "strategy": "slowdown-loop",
  "extraHoldSeconds": 3.35,
  "requiresRegeneration": false
}
```

This is within the existing render policy for video scenes:

- `scripts/render-duration-policy.mjs` allows non-image video scenes up to `ratio <= 1.7` and `extraHoldSeconds <= 4`.
- The renderer selected `slowdown-loop`, produced a synchronized scene, and marked the job `freezeRisk: "low"`.
- `scripts/analyze-youtube-output.mjs` independently flags any scene with `ratio > 1.3` as `HARD_FREEZE_RISK`, ignoring `strategy`, `requiresRegeneration`, and the central render policy.

So the current failure is a **policy mismatch between render and final QA**, not a module packaging failure and not an ffmpeg crash.

Important correction: PowerShell displayed `draft.json` text as mojibake, but Node reading the same file as UTF-8 shows valid Korean. The draft file itself is not corrupted in this job. Do not treat terminal mojibake display as a draft failure unless `validateDraftQuality()` also rejects the file.

---

## Secondary Observations

- Gemini Gems failed twice and normal Gemini fallback was accepted. This is visible in `provider-fallback-chain.json`.
- That provider fallback is separate from the final failure because the accepted draft passed `validateDraftQuality()` and duration QA.
- Final duration is 56.67s against a 60s target. This is within the current shorts tolerance and did not trigger `TARGET_DURATION_DRIFT`.
- The render stage generated all seven scene synced videos, `merged-scenes-synced.mp4`, subtitles, and final MP4.
- Mencius, the read-only `gpt-5.3-codex-spark` reviewer, confirmed the same main cause: `analyze-youtube-output.mjs` has a stricter hard-coded `ratio > 1.3` rule that conflicts with the renderer's `slowdown-loop` policy.
- Mencius also flagged two broader stability risks that are valid but should be scoped carefully:
  - `youtube-workflow.mjs` and `scripts/render-youtube-with-tts.mjs` still rely on hard-coded local paths such as `ROOT` and `TTS_ROOT`.
  - Older and newer output folders may not always contain the same manifest set, so recovery and diagnostics need manifest version awareness.
- Mencius also saw an older `ERR_MODULE_NOT_FOUND` failure in `youtube-1779898331954`. That is the packaged service module issue fixed by `2026-05-28-packaged-render-unpacked-service-modules-plan.md`; this plan should re-run the packaged checks, but should not duplicate that fix.
- `HERMES_FINAL_RENDER_QA_POLICY_REVIEW.md` was reviewed against the current code. The file is mojibake-encoded in the terminal, but its technical claims are readable enough to validate. The following items are accepted into this plan:
  - `analyze-youtube-output.mjs` must pass the correct `sceneOutputMode`/`sourceMode`/`outputMode` into `classifyDurationSyncPolicy()`.
  - Regression tests that create temp job folders must clean them up with `rmSync(..., { recursive: true, force: true })`.
  - `job-progress-events.mjs` should distinguish "render process failed" from "final video rendered but QA blocked it".
  - `workflow-db-events.mjs` should extract final QA failure codes from `event.details.failureCodes` or `event.details.finalOutputQa.failureCodes` and should recognize text such as `HARD_FREEZE_RISK`.

---

## Design Decisions

- [ ] Use `classifyDurationSyncPolicy()` as the source of truth in final output QA.
- [ ] Treat `slowdown-loop` as warning-only when the same policy would not require regeneration.
- [ ] Keep `tpad`, `freezeRisk: "high"`, `requiresRegeneration: true`, invalid durations, and policy-required regeneration as `HARD_FREEZE_RISK` or a more precise duration failure.
- [ ] Preserve strict failure for real hard freezes. This is not a blanket removal of `HARD_FREEZE_RISK`.
- [ ] Improve failure messaging so the UI distinguishes:
  - render process failed
  - final video rendered but QA blocked publishing
  - final video rendered and QA passed
- [ ] Make DB failure mirroring searchable by the actual final QA code.
  - Example: `HARD_FREEZE_RISK` should be mirrored as `[HARD_FREEZE_RISK] ...` in `task_failures.error_msg`, not as an unclassified generic render failure.
- [ ] Do not rewrite the Gemini/Gems provider flow in this patch. Add a note/test only if the failure report starts mislabeling provider fallback as render failure.
- [ ] Treat absolute path hardening as a follow-up stabilization task unless it directly blocks this QA policy fix.
  - Reason: `ROOT` and `TTS_ROOT` are real deployment risks, but changing them touches render execution, TTS invocation, Electron context paths, and packaged smoke tests. It should be implemented as a separate small plan after this false QA failure is fixed.
- [ ] Keep packaged module checks in the verification list because older failures may still exist in old output folders.

---

## Files To Modify

- Modify: `scripts/analyze-youtube-output.mjs`
  - Import `classifyDurationSyncPolicy`.
  - Replace the hard-coded `scene.strategy === "tpad" || scene.ratio > 1.3` rule.
  - Report soft mismatch warnings separately from hard freeze failures.

- Create: `scripts/check-final-output-soft-slowdown-qa.mjs`
  - Add a focused regression test for this exact failure shape.

- Modify: `package.json`
  - Wire the new check into `check:final-output-qa`.

- Modify: `electron/services/job-progress-events.mjs`
  - If needed, ensure final QA failures are reported as "final video generated but QA failed", not as "render did not create a video".

- Modify: `scripts/check-desktop-progress-feedback.mjs`
  - Add a contract assertion for the improved QA failure wording if `job-progress-events.mjs` changes.

- Modify: `workflow-db-events.mjs`
  - Extract `failureCodes` arrays from final QA event details.
  - Add fallback text matching for `HARD_FREEZE_RISK`, `TARGET_DURATION_DRIFT`, and `VISUAL_REPETITION_RISK`.

- Modify: `timeline.md`
  - Add a short entry after implementation and verification.

- Follow-up plan candidate, not part of this patch:
  - `scripts/render-youtube-with-tts.mjs`
  - `youtube-workflow.mjs`
  - `electron/services/path-resolver.mjs`
  - Goal: remove hard-coded `ROOT` and `TTS_ROOT`, pass runtime paths through environment/context, and add package/portable install smoke tests.

---

## Task 1: Add A Regression Check For Soft Slowdown QA

**Files:**

- Create: `scripts/check-final-output-soft-slowdown-qa.mjs`

- [ ] **Step 1: Create a minimal temp job fixture in the check script**

Use `mkdtempSync(join(tmpdir(), "hermes-soft-slowdown-qa-"))` so every run is isolated.

The script should create a temp directory containing:

```json
// job-request.json
{
  "id": "qa-soft-slowdown-fixture",
  "sourceType": "url",
  "sourceValue": "https://example.com/article",
  "options": {
    "scriptStructure": "hpsl",
    "customDurationSeconds": 60
  }
}
```

```json
// draft.json
{
  "title": "펜타닐의 위험성",
  "structure": "HPSL",
  "hpsl": {
    "hook": { "goal": "Hook", "narration": "한 번의 호기심이 삶을 흔들 수 있습니다.", "target_seconds": 7 },
    "point": { "goal": "Point", "narration": "펜타닐은 매우 강한 마약성 진통제입니다.", "target_seconds": 13 },
    "story": { "goal": "Story", "narration": "처음에는 통증 완화로 시작되지만 오남용은 위험합니다.", "target_seconds": 30 },
    "lesson": { "goal": "Lesson", "narration": "의사의 처방 없는 사용은 피해야 합니다.", "target_seconds": 10 }
  },
  "script": "한 번의 호기심이 삶을 흔들 수 있습니다. 펜타닐은 매우 강한 마약성 진통제입니다. 처음에는 통증 완화로 시작되지만 오남용은 위험합니다. 의사의 처방 없는 사용은 피해야 합니다.",
  "scenes": [
    { "order": 1, "narration": "한 번의 호기심이 삶을 흔들 수 있습니다.", "image_prompt": "cinematic symbolic hourglass", "visual_category": "curiosity-object" },
    { "order": 2, "narration": "펜타닐은 매우 강한 마약성 진통제입니다.", "image_prompt": "generic medicine bottle in a hospital cabinet", "visual_category": "core-fact-demo" }
  ]
}
```

```json
// render-report-v2.json
{
  "ok": true,
  "finalDuration": 56.67,
  "subtitleEnd": 56.63,
  "freezeRisk": "low",
  "requiresRegeneration": false,
  "scenes": [
    {
      "order": 1,
      "videoDuration": 8,
      "audioDuration": 11.35,
      "ratio": 1.41875,
      "strategy": "slowdown-loop",
      "extraHoldSeconds": 3.35,
      "requiresRegeneration": false,
      "sceneOutputMode": "video"
    },
    {
      "order": 2,
      "videoDuration": 8,
      "audioDuration": 8,
      "ratio": 1,
      "strategy": "setpts",
      "extraHoldSeconds": 0,
      "requiresRegeneration": false,
      "sceneOutputMode": "video"
    }
  ]
}
```

```json
// scene_audio_manifest.json
{
  "ok": true,
  "scenes": [
    { "order": 1, "duration": 11.35, "text": "한 번의 호기심이 삶을 흔들 수 있습니다." },
    { "order": 2, "duration": 8, "text": "펜타닐은 매우 강한 마약성 진통제입니다." }
  ]
}
```

- [ ] **Step 2: Assert soft slowdown does not fail**

Use:

```javascript
const result = analyzeYouTubeOutput(tempJobDir);
assert.equal(result.ok, true);
assert.equal(result.failureCodes.includes("HARD_FREEZE_RISK"), false);
```

- [ ] **Step 3: Assert a real hard freeze still fails**

Change scene 1 to:

```json
{
  "order": 1,
  "videoDuration": 8,
  "audioDuration": 14,
  "ratio": 1.75,
  "strategy": "tpad",
  "extraHoldSeconds": 6,
  "requiresRegeneration": true,
  "sceneOutputMode": "video"
}
```

Assert:

```javascript
const hardResult = analyzeYouTubeOutput(tempJobDir);
assert.equal(hardResult.ok, false);
assert.equal(hardResult.failureCodes.includes("HARD_FREEZE_RISK"), true);
```

- [ ] **Step 4: Always clean up the temp directory**

Wrap the test body with:

```javascript
let tempJobDir = "";
try {
  tempJobDir = mkdtempSync(join(tmpdir(), "hermes-soft-slowdown-qa-"));
  // write fixture files and run assertions
} finally {
  if (tempJobDir) rmSync(tempJobDir, { recursive: true, force: true });
}
```

- [ ] **Step 5: Run the check and confirm it fails before implementation**

Run:

```powershell
node scripts\check-final-output-soft-slowdown-qa.mjs
```

Expected before fix:

```text
AssertionError: soft slowdown should not trigger HARD_FREEZE_RISK
```

---

## Task 2: Make Final Output QA Reuse Render Duration Policy

**Files:**

- Modify: `scripts/analyze-youtube-output.mjs`

- [ ] **Step 1: Import the central policy**

Add:

```javascript
import { classifyDurationSyncPolicy } from "./render-duration-policy.mjs";
```

- [ ] **Step 2: Replace the hard-coded hard freeze filter**

Replace this current logic:

```javascript
.filter((scene) => scene.strategy === "tpad" || scene.ratio > 1.3);
```

with logic equivalent to:

```javascript
function isHardFreezeScene(scene) {
  const videoDuration = Number(scene.videoDuration || 0);
  const audioDuration = Number(scene.audioDuration || 0);
  const outputMode = scene.sceneOutputMode || scene.sourceMode || scene.outputMode || "";
  const policy = classifyDurationSyncPolicy({
    order: scene.order,
    videoDuration,
    audioDuration,
    outputMode,
  });
  return (
    scene.strategy === "tpad"
    || scene.freezeRisk === "high"
    || scene.requiresRegeneration === true
    || policy.requiresRegeneration
  );
}
```

The `outputMode` fallback order is intentional:

1. `scene.sceneOutputMode` from `scene-render-manifest.json` or `render-report-v2.json`
2. `scene.sourceMode` for older render reports
3. `scene.outputMode` for draft-like scene objects
4. empty string, which falls back to video thresholds

- [ ] **Step 3: Preserve diagnostic details**

Keep `details.hardFreezeScenes` shaped like:

```javascript
{
  order,
  videoDuration,
  audioDuration,
  ratio,
  strategy,
  extraHoldSeconds
}
```

Add optional fields when useful:

```javascript
policyStrategy: policy.strategy,
policyFailureCode: policy.failureCode
```

- [ ] **Step 4: Avoid false positives for still-image motion**

Ensure scenes with:

```json
{
  "strategy": "still-image-fps-duplicate",
  "sceneOutputMode": "image"
}
```

do not trigger `HARD_FREEZE_RISK` only because the original Flow image was represented as a short MP4.

- [ ] **Step 5: Keep soft warnings observable**

If a scene is policy-approved but still has a soft mismatch, expose it as warning detail, not failure:

```javascript
details.softDurationWarnings = reportScenes
  .filter((scene) => scene.strategy === "slowdown-loop" && !isHardFreezeScene(scene))
  .map((scene) => ({
    order: scene.order,
    strategy: scene.strategy,
    ratio: Number(scene.ratio || 0),
    extraHoldSeconds: Number(scene.extraHoldSeconds || 0),
  }));
```

This keeps the quality issue visible without blocking a completed video.

---

## Task 3: Wire The New Check Into The Suite

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Add the new check to `check:final-output-qa`**

Update:

```json
"check:final-output-qa": "node scripts/check-final-output-artifact-qa.mjs && node scripts/check-generic-visual-repetition-analyzer.mjs && node scripts/check-final-duration-drift.mjs && node scripts/check-latest-failed-job-regression.mjs && node scripts/check-final-output-soft-slowdown-qa.mjs && node scripts/check-packaged-runtime-contract.mjs && node scripts/check-final-output-qa-observability.mjs"
```

- [ ] **Step 2: Run only final QA checks**

Run:

```powershell
npm.cmd run check:final-output-qa
```

Expected:

```text
check-final-output-soft-slowdown-qa passes
```

---

## Task 4: Improve Failure Wording For Rendered-But-QA-Failed Jobs

**Files:**

- Inspect: `electron/services/job-progress-events.mjs`
- Modify only if current UI still makes QA failure look like a render crash.
- Test: `scripts/check-desktop-progress-feedback.mjs`

- [ ] **Step 1: Inspect current failure event wording**

Confirm that `Final output QA failed:` maps to phase `render`.

- [ ] **Step 2: Add clearer message details if needed**

For QA failure, the user-facing event should communicate:

```text
최종 영상 파일은 생성됐지만 QA 검수에서 막혔습니다.
```

Details should include:

```json
{
  "phase": "render",
  "finalVideoExists": true,
  "qaFailure": true,
  "failureCodes": ["HARD_FREEZE_RISK"]
}
```

- [ ] **Step 3: Add/adjust contract test**

In `scripts/check-desktop-progress-feedback.mjs`, assert that QA failure is not described as missing media or module failure.

---

## Task 5: Mirror Final QA Codes Into SQLite Failure Logs

**Files:**

- Modify: `workflow-db-events.mjs`
- Test: `scripts/check-desktop-progress-feedback.mjs`

- [ ] **Step 1: Extract structured QA failure arrays before text fallback**

In `failureCodeOf(event)`, after direct single-code checks and before free-text regex checks, add:

```javascript
if (Array.isArray(event.details?.failureCodes) && event.details.failureCodes.length > 0) {
  return String(event.details.failureCodes[0]);
}
if (Array.isArray(event.details?.finalOutputQa?.failureCodes) && event.details.finalOutputQa.failureCodes.length > 0) {
  return String(event.details.finalOutputQa.failureCodes[0]);
}
```

- [ ] **Step 2: Add final QA regex fallback**

Add:

```javascript
if (/HARD_FREEZE_RISK/i.test(text)) return "HARD_FREEZE_RISK";
if (/TARGET_DURATION_DRIFT/i.test(text)) return "TARGET_DURATION_DRIFT";
if (/VISUAL_REPETITION_RISK/i.test(text)) return "VISUAL_REPETITION_RISK";
```

- [ ] **Step 3: Extend the progress feedback contract**

In `scripts/check-desktop-progress-feedback.mjs`, assert:

```javascript
assert.match(workflowDbEvents, /finalOutputQa/, "workflow DB mirror should inspect final output QA failure codes");
assert.match(workflowDbEvents, /HARD_FREEZE_RISK/, "workflow DB mirror should classify hard freeze QA failures");
assert.match(workflowDbEvents, /TARGET_DURATION_DRIFT/, "workflow DB mirror should classify target duration QA failures");
assert.match(workflowDbEvents, /VISUAL_REPETITION_RISK/, "workflow DB mirror should classify visual repetition QA failures");
```

---

## Task 6: Verify Against The Actual Latest Job

**Files:**

- Use existing output folder:
  - `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779904137210`

- [ ] **Step 1: Re-run analysis on the latest job**

Run:

```powershell
node scripts\analyze-youtube-output.mjs C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779904137210
```

Expected after fix:

```json
{
  "ok": true
}
```

or, if another legitimate QA issue remains, it should no longer include:

```text
HARD_FREEZE_RISK
```

- [ ] **Step 2: Render-only retry from Hermes Studio**

Use the existing recovery action:

```text
Render Existing Assets
```

Expected:

- No Flow regeneration needed.
- No `ERR_MODULE_NOT_FOUND`.
- No false `HARD_FREEZE_RISK` for scene 1 `slowdown-loop`.
- Final video remains:

```text
C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779904137210\desktop-flow-1779904137283.mp4
```

- [ ] **Step 3: Re-run packaged module checks**

Because older output folder `youtube-1779898331954` failed with `ERR_MODULE_NOT_FOUND`, confirm the currently built package still has the fix:

```powershell
node scripts\check-packaged-render-import-graph.mjs
node scripts\check-packaged-runtime-contract.mjs
```

Expected:

```text
packaged-render-import-graph ok
packaged-runtime-contract ok
```

Do not use old output folders as proof that the current build is broken; old folders can preserve failures from before the package was rebuilt.

---

## Task 7: Record The Fix

**Files:**

- Modify: `timeline.md`

- [ ] **Step 1: Add a dated entry**

Add:

```markdown
- 2026-05-28 HH:mm KST - Fix - Final output QA soft slowdown policy
  - Fixed a false `HARD_FREEZE_RISK` where final render succeeded with `slowdown-loop`, but final QA used a stricter hard-coded ratio threshold.
  - Final output QA now reuses the central render duration policy.
  - Verified against `youtube-1779904137210` and the full QA/check suite.
```

---

## Verification Commands

Run these in order:

```powershell
node scripts\check-final-output-soft-slowdown-qa.mjs
npm.cmd run check:final-output-qa
node scripts\check-desktop-progress-feedback.mjs
node scripts\analyze-youtube-output.mjs C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779904137210
node scripts\check-packaged-render-import-graph.mjs
node scripts\check-packaged-runtime-contract.mjs
npm.cmd run check
```

If packaging changes are not touched, `npm.cmd run electron:pack` is not mandatory for this fix. If `package.json` check scripts are changed, run the full `npm.cmd run check` before declaring completion.

---

## Risks And Mitigations

- [ ] **Risk:** Weakening `HARD_FREEZE_RISK` could allow visible freezes.
  - **Mitigation:** Do not remove the failure. Reuse `classifyDurationSyncPolicy()` so only policy-approved `slowdown-loop` cases pass.

- [ ] **Risk:** `slowdown-loop` currently uses `setpts`, so a 1.419x opening video can still feel slower than desired.
  - **Mitigation:** Keep it as warning-only in this patch. A separate visual quality improvement can split long opening narration or request a longer opening clip.

- [ ] **Risk:** Terminal mojibake may mislead debugging.
  - **Mitigation:** Use Node UTF-8 reads and `validateDraftQuality()` as the source of truth, not PowerShell-rendered Korean text.

- [ ] **Risk:** Gems provider failures are visible but unrelated.
  - **Mitigation:** Keep provider fallback work separate. The failure being fixed here is final QA policy mismatch.

- [ ] **Risk:** Absolute local paths in render/TTS scripts can still break on another PC or different install path.
  - **Mitigation:** Add a separate follow-up plan to inject app root, user data root, and TTS root through Electron context/env. Do not bundle that larger refactor into this QA policy fix.

- [ ] **Risk:** Output folders created by different Hermes versions have different manifest sets.
  - **Mitigation:** Keep QA analysis tolerant of missing older manifests, but add schema/version checks before recovery actions in a later recovery-focused patch.
