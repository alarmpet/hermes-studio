# Final Output Title and Intro Loop Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the latest Hermes Studio final-output QA issues where the top title is truncated and the opening Flow video clip is visibly repeated.

**Architecture:** Treat these as two separate render-contract bugs. The title overlay must never silently drop title text; the intro video duration policy must avoid repeating one Flow clip when the narration is longer than the generated clip. The preferred recovery is to split long opening narration before Flow generation or fill the overrun with a distinct B-roll/image-motion fallback, not by looping the same video.

**Tech Stack:** Electron, Node.js ES modules, ffmpeg-static, Google Flow automation output, Hermes render QA manifests.

---

## Evidence From Latest Output

Latest inspected output:

`C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1780244097318`

Observed files:

- Final video: `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1780244097318\desktop-flow-1780244097396.mp4`
- Title overlay metadata: `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1780244097318\title-overlay.json`
- Render report: `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1780244097318\render-report-v2.json`
- Draft: `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1780244097318\draft.json`

Root cause 1: title text truncation.

- Intended title: `가벼워지는 통신비, 내 스마트폰 요금도 줄어들까?`
- Rendered title lines in `title-overlay.json`: `["가벼워지는통신비,내"]`
- `render-options.json` requested `maxLines: 2`, but `wrapBalancedTitle()` received `maxChars=10`.
- Current `balancedCharacterSplit()` cannot handle titles longer than `maxChars * maxLines`; when no valid split exists, it falls back to only `chars.slice(0, maxChars)`.
- Result: the rest of the title is silently dropped, causing the top title to look cut off.

Root cause 2: opening video repetition.

- Scene 1 draft narration has two long Korean sentences in one video scene.
- Scene 1 generated Flow video duration: 8.0s.
- Scene 1 TTS duration: about 12.6s.
- Render report: `strategy: "loop-extension"`, `ratio: 1.801`, `extraHoldSeconds: 5.61`.
- The previous bugfix prevented render failure, but it used `ffmpeg -stream_loop -1`, so the same Flow clip repeats to cover the longer audio. That removes the hard failure but creates a visible repeated-video artifact.

---

## Desired Behavior

1. Top title should show a deliberate shortened hook title, never an accidental partial substring.
2. Top title should balance lines visually:
   - 9:16 shortform default: 2 lines maximum.
   - Auto-generated title text should be 18 Korean characters or fewer excluding spaces.
   - Do not exceed the title band.
   - Auto-fit font size and band height from actual line count.
3. Opening video scenes should not repeat the same Flow clip when the audio is too long.
4. Long opening narration should be split before Flow generation:
   - Each video scene narration target: 5-8 seconds.
   - One Korean sentence or short clause per opening video scene.
   - If the user selected `hybridIntroVideoSceneCount=1` but the first narration is too long, split it into scene 1A and 1B only when the generated draft already contains two sentences or clear clause boundaries.
5. If a too-long video scene is discovered after media generation, fallback should be:
   - Prefer a distinct still B-roll motion segment for the overrun.
   - Only use same-video looping as a last-resort debug fallback and mark it as a visible quality warning.

---

## File Map

- Modify: `C:\Users\amd\hermes\electron\services\title-overlay-layout.mjs`
  - Owns title line wrapping.
  - Must stop dropping text silently.

- Modify: `C:\Users\amd\hermes\scripts\render-youtube-with-tts.mjs`
  - Owns top title PNG creation and scene duration render strategy.
  - Must compute dynamic title line count/font/band height.
  - Must replace visible `loop-extension` behavior for ordinary production renders.

- Modify: `C:\Users\amd\hermes\scripts\check-title-overlay-balanced-lines.mjs`
  - Regression coverage for Korean full-title wrapping.

- Create: `C:\Users\amd\hermes\scripts\check-title-overlay-no-truncation.mjs`
  - Contract test ensuring long titles keep all non-space characters or report explicit intentional shortening.

- Modify: `C:\Users\amd\hermes\scripts\check-render-soft-ratio-policy.mjs`
  - Update expectations so moderate video mismatch does not hard fail, but also does not silently repeat a clip as a polished production result.

- Modify: `C:\Users\amd\hermes\scripts\render-duration-policy.mjs`
  - Distinguish `needs-secondary-visual` from `loop-extension`.

- Modify: `C:\Users\amd\hermes\youtube-workflow.mjs`
  - Split overlong hybrid intro video narration before Flow media generation.

- Modify: `C:\Users\amd\hermes\youtube-job-schema.mjs`
  - Add optional thresholds for intro-video max narration seconds if needed.

- Modify: `C:\Users\amd\hermes\package.json`
  - Add new check script to the main `npm.cmd run check` chain if the repo uses explicit check aggregation.

- Modify: `C:\Users\amd\hermes\bugfix.md`
  - Record this latest output issue, root cause, and recovery.

- Modify: `C:\Users\amd\hermes\timeline.md`
  - Add a dated architecture note for title overlay and intro video duration policy.

---

### Task 1: Add a No-Truncation Title Wrapping Contract

**Files:**

- Create: `C:\Users\amd\hermes\scripts\check-title-overlay-no-truncation.mjs`
- Modify: `C:\Users\amd\hermes\package.json`

- [ ] **Step 1: Create the failing test**

Create `C:\Users\amd\hermes\scripts\check-title-overlay-no-truncation.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { wrapBalancedTitle } from "../electron/services/title-overlay-layout.mjs";

function compact(value = "") {
  return String(value).replace(/\s+/gu, "");
}

const title = "가벼워지는 통신비, 내 스마트폰 요금도 줄어들까?";
const lines = wrapBalancedTitle(title, { maxChars: 10, maxLines: 3 });
const rendered = compact(lines.join(""));
const expected = compact(title);

assert.ok(lines.length >= 2, "long Korean title should use multiple lines");
assert.ok(lines.length <= 3, "shortform title should fit within three lines");
assert.equal(rendered, expected, "title wrapper must not silently drop Korean title text");
assert.ok(lines.every((line) => Array.from(compact(line)).length <= 12), "each line should remain visually bounded");

console.log(JSON.stringify({ ok: true, checked: "title-overlay-no-truncation" }));
```

- [ ] **Step 2: Run the test and verify it fails on current code**

Run:

```powershell
node scripts\check-title-overlay-no-truncation.mjs
```

Expected before implementation:

```text
AssertionError: title wrapper must not silently drop Korean title text
```

- [ ] **Step 3: Add the check to `package.json`**

If `package.json` has a `check` script that lists individual `node scripts\check-*.mjs` commands, add:

```json
"node scripts/check-title-overlay-no-truncation.mjs"
```

Keep the existing command style in the file.

---

### Task 2: Fix Title Wrapping So It Never Silently Drops Text

**Files:**

- Modify: `C:\Users\amd\hermes\electron\services\title-overlay-layout.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-title-overlay-balanced-lines.mjs`

- [ ] **Step 1: Replace the fallback behavior in `balancedCharacterSplit()`**

Update `balancedCharacterSplit()` so it distributes all characters across the allowed line count instead of returning only the first line.

Implementation pattern:

```js
function balancedCharacterSplit(title, maxChars, maxLines = 2) {
  const chars = Array.from(title.replace(/\s+/gu, ""));
  if (chars.length <= maxChars) return [chars.join("")];

  const lineCount = Math.min(
    Math.max(2, Number(maxLines || 2)),
    Math.max(2, Math.ceil(chars.length / maxChars)),
  );
  const targetLength = Math.ceil(chars.length / lineCount);
  const boundedLength = Math.min(Math.max(1, targetLength), maxChars);
  const lines = [];

  for (let index = 0; index < chars.length && lines.length < lineCount; index += boundedLength) {
    lines.push(chars.slice(index, index + boundedLength).join(""));
  }

  if (lines.join("").length < chars.join("").length) {
    const consumed = lines.join("").length;
    lines[lines.length - 1] += chars.slice(consumed).join("");
  }

  return lines;
}
```

- [ ] **Step 2: Pass `maxLines` into `balancedCharacterSplit()`**

Change:

```js
return balancedCharacterSplit(title, limit);
```

To:

```js
return balancedCharacterSplit(title, limit, lineLimit);
```

- [ ] **Step 3: Update existing Korean title tests with readable UTF-8 strings**

Replace garbled Korean literals in `C:\Users\amd\hermes\scripts\check-title-overlay-balanced-lines.mjs` with readable Korean strings.

Use:

```js
const compact = wrapBalancedTitle("구글글래스의 숨은 반전", { maxChars: 10, maxLines: 2 });
assert.deepEqual(compact, ["구글글래스의", "숨은반전"], "compact Korean titles should split into visually balanced lines");

const latestOutputTitle = wrapBalancedTitle("가벼워지는 통신비, 내 스마트폰 요금도 줄어들까?", { maxChars: 10, maxLines: 3 });
assert.deepEqual(latestOutputTitle, ["가벼워지는통신비", ",내스마트폰요금", "도줄어들까?"], "long latest-output title should fit without truncation");
```

- [ ] **Step 4: Run title wrapping tests**

Run:

```powershell
node scripts\check-title-overlay-balanced-lines.mjs
node scripts\check-title-overlay-no-truncation.mjs
```

Expected:

```text
{"ok":true,"checked":"title-overlay-balanced-lines"}
{"ok":true,"checked":"title-overlay-no-truncation"}
```

---

### Task 3: Make the Rendered Top Title Auto-Fit 2-3 Lines

**Files:**

- Modify: `C:\Users\amd\hermes\scripts\render-youtube-with-tts.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-title-overlay-render-contract.mjs`

- [ ] **Step 1: Allow three lines when the full title cannot fit two lines**

In `createTitleOverlayImage()`, replace the fixed shortform max line behavior:

```js
const maxChars = isLandscape ? 18 : 10;
const lines = wrapBalancedTitle(title, { maxChars, maxLines: Number(overlay.maxLines || 2) });
```

With:

```js
const requestedMaxLines = Number(overlay.maxLines || 2);
const titleLength = Array.from(title.replace(/\s+/gu, "")).length;
const shortformMaxLines = titleLength > 20 ? Math.max(requestedMaxLines, 3) : requestedMaxLines;
const maxLines = isLandscape ? requestedMaxLines : Math.min(3, shortformMaxLines);
const maxChars = isLandscape ? 18 : Math.ceil(titleLength / maxLines);
const lines = wrapBalancedTitle(title, { maxChars, maxLines });
```

- [ ] **Step 2: Make title band height and font size react to line count**

In `buildTitleOverlayLayout()`, keep the current dynamic formula but lower font size for 3-line shortform titles.

Add after `baseFontSize`:

```js
const lineCount = Math.max(1, lines.length);
const lineCountFontCap = !isLandscape && lineCount >= 3 ? 66 : baseFontSize;
```

Then change:

```js
const fontSize = Math.max(isLandscape ? 42 : 58, Math.min(baseFontSize, fittedFontSize));
```

To:

```js
const fontSize = Math.max(isLandscape ? 42 : 52, Math.min(lineCountFontCap, fittedFontSize));
```

- [ ] **Step 3: Persist title fit diagnostics**

Add these fields to the `metadata` object in `createTitleOverlayImage()`:

```js
maxLines,
titleCharacterLength: Array.from(title.replace(/\s+/gu, "")).length,
renderedCharacterLength: Array.from(lines.join("").replace(/\s+/gu, "")).length,
titleTruncated: Array.from(lines.join("").replace(/\s+/gu, "")).length < Array.from(title.replace(/\s+/gu, "")).length,
```

- [ ] **Step 4: Extend the render contract test**

In `C:\Users\amd\hermes\scripts\check-title-overlay-render-contract.mjs`, assert the renderer persists `titleTruncated`:

```js
assert.match(renderer, /titleTruncated/, "renderer should persist whether the title was truncated");
assert.match(renderer, /renderedCharacterLength/, "renderer should expose rendered title character length");
```

- [ ] **Step 5: Run title overlay checks**

Run:

```powershell
node scripts\check-title-overlay-render-contract.mjs
node scripts\check-title-overlay-balanced-lines.mjs
node scripts\check-title-overlay-no-truncation.mjs
```

Expected: all three checks pass.

---

### Task 4: Stop Treating Same-Clip Looping as the Normal Production Recovery

**Files:**

- Modify: `C:\Users\amd\hermes\scripts\render-duration-policy.mjs`
- Modify: `C:\Users\amd\hermes\scripts\render-youtube-with-tts.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-render-soft-ratio-policy.mjs`

- [ ] **Step 1: Introduce a production-safe strategy name**

In `C:\Users\amd\hermes\scripts\render-duration-policy.mjs`, change the moderate video mismatch strategy from:

```js
strategy: videoLoopExtensionMismatch ? "loop-extension" : "slowdown-loop",
```

To:

```js
strategy: videoLoopExtensionMismatch ? "needs-secondary-visual" : "slowdown-loop",
```

Change warning code:

```js
code: videoLoopExtensionMismatch ? "VIDEO_LOOP_EXTENSION" : "SOFT_DURATION_MISMATCH",
```

To:

```js
code: videoLoopExtensionMismatch ? "VIDEO_NEEDS_SECONDARY_VISUAL" : "SOFT_DURATION_MISMATCH",
```

- [ ] **Step 2: Keep `loop-extension` only as explicit fallback**

In `renderSceneVideo()`, replace:

```js
if (policy.strategy === "loop-extension") {
```

With:

```js
if (policy.strategy === "needs-secondary-visual") {
  const failure = {
    ...policy,
    failureCode: "VIDEO_NEEDS_SECONDARY_VISUAL",
    suggestedRecovery: "Split this opening narration before Flow generation or render a distinct secondary B-roll/image-motion segment for the overrun.",
  };
  writeFileSync(join(JOB_DIR, `scene_${order}_duration_recovery_required.json`), JSON.stringify(failure, null, 2), "utf8");
  throw new Error(`RENDER_QA_RECOVERY_REQUIRED: ${failure.failureCode} scene=${failure.failedSceneOrder || order} ratio=${failure.ratio}`);
}

if (policy.strategy === "loop-extension") {
```

This restores a clean failure for old jobs while preventing polished output with visible repeated video.

- [ ] **Step 3: Update policy tests**

In `C:\Users\amd\hermes\scripts\check-render-soft-ratio-policy.mjs`, change the actual latest case expectation:

```js
assert.equal(reportedFailureCase.strategy, "needs-secondary-visual", "reported scene=1 ratio=2.11 should require a secondary visual instead of repeating one clip");
```

Keep the extreme mismatch test as hard `SCENE_DURATION_MISMATCH`.

- [ ] **Step 4: Run policy tests**

Run:

```powershell
node scripts\check-render-soft-ratio-policy.mjs
node --check scripts\render-duration-policy.mjs
node --check scripts\render-youtube-with-tts.mjs
```

Expected: all pass.

---

### Task 5: Split Overlong Hybrid Intro Narration Before Flow Generation

**Files:**

- Modify: `C:\Users\amd\hermes\youtube-workflow.mjs`
- Modify: `C:\Users\amd\hermes\youtube-job-schema.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-hybrid-intro-video-split.mjs`

- [ ] **Step 1: Create the failing split contract**

Create `C:\Users\amd\hermes\scripts\check-hybrid-intro-video-split.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { normalizeYouTubeDraftForJob } from "../youtube-workflow.mjs";

const draft = {
  title: "가벼워지는 통신비, 내 스마트폰 요금도 줄어들까?",
  duration_seconds: 60,
  structure: "HPSL",
  hpsl: {},
  script: "매달 통장 출금 내역에서 가장 눈에 거슬리던 고정 지출, 바로 통신비인데요. 이제 이 무거운 통신요금에 본격적인 다이어트가 시작된다는 사실, 알고 계셨나요?",
  scenes: [{
    order: 1,
    narration: "매달 통장 출금 내역에서 가장 눈에 거슬리던 고정 지출, 바로 통신비인데요. 이제 이 무거운 통신요금에 본격적인 다이어트가 시작된다는 사실, 알고 계셨나요?",
    image_prompt: "9:16 cinematic smartphone bill B-roll, no text, no logos",
    duration_seconds: 7,
  }],
};

const normalized = normalizeYouTubeDraftForJob(draft, {
  targetDurationSeconds: 60,
  flowOutputMode: "hybrid",
  hybridIntroVideoSceneCount: 1,
  introVideoMaxNarrationChars: 46,
});

assert.ok(normalized.scenes.length >= 2, "overlong intro narration should split into more than one scene");
assert.equal(normalized.scenes[0].flowOutputMode, "video", "first split intro scene should stay video");
assert.ok(Array.from(normalized.scenes[0].narration).length <= 46, "first video narration should be short enough for one Flow clip");
assert.notEqual(normalized.scenes[0].narration, normalized.scenes[1].narration, "split scenes should not duplicate the same narration");

console.log(JSON.stringify({ ok: true, checked: "hybrid-intro-video-split" }));
```

- [ ] **Step 2: Export or expose draft normalization for testing**

If `normalizeYouTubeDraftForJob` is currently not exported from `C:\Users\amd\hermes\youtube-workflow.mjs`, export it:

```js
export function normalizeYouTubeDraftForJob(draft, job) {
  // existing normalization body
}
```

If the file has a differently named normalization function, use that existing name in the test instead of creating a duplicate.

- [ ] **Step 3: Implement `splitIntroVideoScenes()`**

Add this helper near draft scene normalization in `C:\Users\amd\hermes\youtube-workflow.mjs`:

```js
function splitIntroVideoScenes(scenes, job = {}) {
  const introCount = Math.max(0, Number(job.hybridIntroVideoSceneCount || 0));
  const maxChars = Math.max(28, Number(job.introVideoMaxNarrationChars || 46));
  const result = [];

  for (const scene of scenes) {
    const isIntroVideo = Number(scene.order || result.length + 1) <= introCount
      && (scene.flowOutputMode === "video" || scene.outputMode === "video");
    const narration = String(scene.narration || "").trim();
    if (!isIntroVideo || Array.from(narration).length <= maxChars) {
      result.push(scene);
      continue;
    }

    const parts = splitKoreanNarrationForVideo(narration, maxChars);
    for (const [index, part] of parts.entries()) {
      result.push({
        ...scene,
        narration: part,
        duration_seconds: Math.max(5, Math.min(8, Number(scene.duration_seconds || 7))),
        outputMode: index === 0 ? "video" : "image",
        flowOutputMode: index === 0 ? "video" : "image",
        splitFromSceneOrder: scene.order,
        splitPart: index + 1,
      });
    }
  }

  return result.map((scene, index) => ({ ...scene, order: index + 1 }));
}

function splitKoreanNarrationForVideo(narration, maxChars) {
  const sentences = String(narration)
    .split(/(?<=[.!?。！？]|[요다죠까])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks = [];
  for (const sentence of sentences.length ? sentences : [narration]) {
    if (Array.from(sentence).length <= maxChars) {
      chunks.push(sentence);
      continue;
    }
    const clauses = sentence
      .split(/(?<=[,，])\s*/u)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const clause of clauses.length > 1 ? clauses : [sentence]) {
      if (Array.from(clause).length <= maxChars) {
        chunks.push(clause);
      } else {
        const chars = Array.from(clause);
        for (let index = 0; index < chars.length; index += maxChars) {
          chunks.push(chars.slice(index, index + maxChars).join(""));
        }
      }
    }
  }
  return chunks;
}
```

- [ ] **Step 4: Apply the split after draft normalization and before Flow media generation**

Inside the draft normalization path, after scenes have `outputMode`/`flowOutputMode`, call:

```js
draft.scenes = splitIntroVideoScenes(draft.scenes, job);
```

Then recompute scene orders and any total duration metadata already used by the workflow.

- [ ] **Step 5: Add schema defaults**

In `C:\Users\amd\hermes\youtube-job-schema.mjs`, add an optional numeric field:

```js
introVideoMaxNarrationChars: optionalNumber(input.introVideoMaxNarrationChars, 46),
```

Use the local schema helper names already present in the file.

- [ ] **Step 6: Run split checks**

Run:

```powershell
node scripts\check-hybrid-intro-video-split.mjs
node scripts\check-youtube-job-schema.mjs
node --check youtube-workflow.mjs
```

Expected: all pass.

---

### Task 6: Add Final Output QA Warnings for Title Truncation and Repeated Video

**Files:**

- Modify: `C:\Users\amd\hermes\scripts\render-youtube-with-tts.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-final-output-qa.mjs`

- [ ] **Step 1: Add title truncation to render report warnings**

When building the final `render-report-v2.json`, append a warning if:

```js
titleOverlayMeta?.titleTruncated === true
```

Warning object:

```js
{
  code: "TITLE_OVERLAY_TRUNCATED",
  message: "Top title overlay dropped part of the title text.",
  title: titleOverlayMeta.title,
  lines: titleOverlayMeta.lines,
}
```

- [ ] **Step 2: Add repeated video warning**

If any scene has `strategy === "loop-extension"`, append:

```js
{
  code: "VISIBLE_VIDEO_LOOP_EXTENSION",
  sceneOrder: scene.order,
  message: "A Flow video clip was looped to cover longer narration; split narration or add secondary B-roll.",
}
```

- [ ] **Step 3: Make final QA fail on title truncation**

In `C:\Users\amd\hermes\scripts\check-final-output-qa.mjs`, fail when `render-report-v2.json` contains `TITLE_OVERLAY_TRUNCATED`.

- [ ] **Step 4: Make final QA fail on visible video loop for production outputs**

In the same file, fail when `VISIBLE_VIDEO_LOOP_EXTENSION` exists unless the job is marked as a mock/smoke test.

- [ ] **Step 5: Run final QA**

Run:

```powershell
npm.cmd run check:final-output-qa
```

Expected: current bad output should be flagged; newly generated fixed outputs should pass.

---

### Task 7: Document the Bugfix

**Files:**

- Modify: `C:\Users\amd\hermes\bugfix.md`
- Modify: `C:\Users\amd\hermes\timeline.md`

- [ ] **Step 1: Add bugfix entry**

Add this section near the top of `bugfix.md`:

```markdown
## 2026-06-01 - Final output QA: top title truncation and repeated intro video

### 증상

- 최종 영상 상단 제목이 `가벼워지는 통신비, 내`까지만 표시되고 나머지 제목이 사라짐.
- 초반 Flow 영상이 같은 클립을 반복해서 사용하는 것처럼 보임.

### 원인

- `wrapBalancedTitle()`가 2줄 제한 안에 긴 제목을 담지 못할 때 나머지 텍스트를 조용히 버림.
- Scene 1 TTS는 약 12.6초인데 Flow 영상은 8초라 렌더러가 `loop-extension`으로 같은 클립을 반복함.

### 수정 방향

- 상단 제목은 2줄에 안 들어가면 3줄/동적 폰트/동적 밴드 높이로 전환하고, 절대 조용히 자르지 않음.
- 초반 영상은 긴 대사를 Flow 생성 전에 분리하고, 같은 클립 반복은 최종 산출물 품질 실패로 취급함.
```

- [ ] **Step 2: Add timeline entry**

Add:

```markdown
## 2026-06-01

- Final output QA에서 상단 제목 잘림과 초반 Flow 영상 반복 문제를 확인했다.
- title overlay wrapping은 no-truncation 계약으로, hybrid intro video는 pre-generation narration split 계약으로 관리하기로 했다.
```

---

### Task 8: Full Verification and Packaging

**Files:**

- No direct source edits.

- [ ] **Step 1: Run targeted checks**

Run:

```powershell
node scripts\check-title-overlay-balanced-lines.mjs
node scripts\check-title-overlay-no-truncation.mjs
node scripts\check-title-overlay-render-contract.mjs
node scripts\check-render-soft-ratio-policy.mjs
node scripts\check-hybrid-intro-video-split.mjs
node scripts\check-youtube-job-schema.mjs
```

Expected: all pass.

- [ ] **Step 2: Run full check**

Run:

```powershell
npm.cmd run check
```

Expected: exit code 0.

- [ ] **Step 3: Run mock render smoke**

Run:

```powershell
npm.cmd run smoke:youtube-mock
```

Expected:

- The produced `render-report-v2.json` has `titleOverlay.titleTruncated: false`.
- No production report contains `VISIBLE_VIDEO_LOOP_EXTENSION`.

- [ ] **Step 4: Package Electron**

Close running Hermes Studio processes first if packaging reports access denied.

Run:

```powershell
npm.cmd run electron:pack
```

Expected:

- `C:\Users\amd\hermes\dist-electron\win-unpacked\Hermes YouTube Studio.exe` exists.
- `C:\Users\amd\hermes\dist-electron\Hermes YouTube Studio Setup 1.0.0.exe` exists.

---

## Acceptance Criteria

- Latest title example renders all meaningful text from `가벼워지는 통신비, 내 스마트폰 요금도 줄어들까?`.
- `title-overlay.json` has `titleTruncated: false`.
- Shortform title lines are balanced across 2 lines maximum and do not overflow the top band.
- Hybrid intro video scenes do not contain a long 12초 narration over a single 8초 Flow video clip.
- Render reports do not treat visible same-clip looping as a clean production result.
- `bugfix.md` and `timeline.md` contain the issue and resolution record.
- `npm.cmd run check` passes after implementation.
