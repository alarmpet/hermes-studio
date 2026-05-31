# Gemini Gems Draft Failure Root Cause Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Hermes Studio from producing or rendering a YouTube video when Gemini/Gems returns placeholders, fallback draft text is mojibake, or final duration is far from the requested duration.

**Architecture:** Keep the current shared workflow entrypoint (`youtube-workflow-stages.mjs`) so Hermes/Electron stay unified. Add strict draft QA at every provider boundary, save provider responses and fallback decisions, then make final output QA fail on both positive and negative duration drift. The UI should surface the failing provider and failure code instead of continuing silently.

**Tech Stack:** Node.js ESM, Playwright Gemini/Gems browser automation, OpenRouter fallback, Electron IPC, existing Hermes check scripts.

---

## Evidence From Latest Failed Job

Latest job examined:

`C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779789068109`

Observed files:

- `gemini-gems-response.txt` and `gemini-response.txt` both contain the schema example literally:
  `{"title":"string", ... "narration":"Korean sentence", ...}`
- `draft.json` is HPSL-shaped but Korean content is mojibake, for example title:
  `AI?? ?몄뀡 媛쒕컻???뚮옯??怨듦컻`
- Flow generation completed for 7 scenes:
  `scene_1.mp4` through `scene_7.mp4` exist.
- Before manual reproduction there was no `render-report-v2.json`, no final mp4, and no TTS output, so the desktop run stopped after asset generation or while entering final render.
- Manual render of the same jobDir succeeded, producing:
  `final-youtube-ai-news-tts-subtitled-v2.mp4`
- Manual render output is still not usable: requested target is 60 seconds but final duration is 27.87 seconds.

Root cause hypothesis:

1. Gemini Gems correctly opens, but the prompt/response extraction accepts a schema-example answer as a candidate response before the real Gem instructions produce usable content.
2. Placeholder detection catches Gems and normal Gemini, but the fallback to OpenRouter is allowed to continue even when the produced Korean text is mojibake.
3. Existing draft QA has no Korean/mojibake language guard, so corrupted text passes.
4. Final output QA only fails when the video is too long. It does not fail when final duration is much shorter than the requested duration.
5. Desktop failure observability is incomplete: final error and provider fallback chain are not persisted in the job folder, making the UI show “failed” without enough diagnosis.

---

## Review Validation Notes

The review document `HERMES_GEMINI_GEMS_DRAFT_FIX_REVIEW.md` was checked against the current codebase before being applied to this plan.

Accepted items:

- The mojibake guard should not rely on simple question-mark counts alone. It must combine mojibake markers, question clusters, Hangul ratio, and minimum text length to avoid false positives on normal Korean scripts that contain rhetorical questions or short fragments.
- Provider fallback should have a small circuit breaker. If multiple providers return the same structural failure class, such as placeholder schema JSON or corrupted Korean, the workflow should stop with a clear failure instead of spending time/cost on more generation attempts.
- `desktop-failure.json` must be sanitized before writing. Raw `input`, environment-like fields, OAuth paths, cookies, tokens, API keys, and passwords should not be stored verbatim in failure artifacts.
- Render effect strength should be preserved in job history and event details so past jobs can be inspected or restored with the same settings.

Rejected or adjusted item:

- The review suggested adding a dedicated SQLite `jobs.motion_intensity` column. That is not accepted for the current codebase because `scripts/check-render-effect-history-persistence.mjs` explicitly protects the existing design: render/effect options are preserved in `workflow_json`, event `details`, and desktop job index data until there is a query UI that needs indexed SQLite columns. The plan instead records `motionIntensity` in workflow events, job history JSON, and render reports.

---

## File Structure

- Modify `scripts/youtube-draft-quality.mjs`
  - Add mojibake detection that combines Hangul ratio, mojibake markers, question-cluster ratio, and minimum text length.
  - Reject provider drafts with corrupted Korean before Flow generation.
- Modify `automation/gemini-research-draft.mjs`
  - Save provider fallback chain.
  - Reject schema-example response at the provider boundary with specific codes.
  - Do not let OpenRouter fallback bypass the same QA guard.
  - Stop early when repeated providers fail with the same structural failure class.
- Modify `electron/services/youtube-draft-service.mjs`
  - Save raw OpenRouter responses in the job folder.
  - Add strict QA before returning fallback drafts.
  - Improve source/article decoding guard.
- Modify `scripts/analyze-youtube-output.mjs`
  - Fail on negative duration drift as well as positive drift.
  - Add `CORRUPTED_KOREAN_DRAFT` if draft text is mojibake.
- Modify `electron/main.mjs`
  - Persist sanitized desktop failure details into `<jobDir>/desktop-failure.json` when possible.
- Modify `youtube-workflow-stages.mjs`
  - Emit progress/failure details that distinguish `gemini-gems`, `gemini`, and `openrouter`.
- Modify `youtube-job-schema.mjs`
  - Add render effect intensity contract values: `none`, `light`, `strong`.
- Modify `electron/renderer/index.html`
  - Expose render effect strength as Korean UI choices: `효과없음`, `약하게`, `강하게`.
- Modify `electron/renderer/app.js`
  - Submit the selected effect strength and show a clear preview message.
- Modify `electron/services/render-effect-presets.mjs`
  - Select random per-scene motion effects based on the selected strength.
- Modify `electron/services/image-scene-renderer.mjs`
  - Treat `none` as a stable still/near-still render without visible zoom/pan.
- Modify `scripts/check-render-effect-presets.mjs`
  - Cover effect strength and random motion selection contract.
- Modify `workflow-db-events.mjs`
  - Mirror `motionIntensity` into workflow event details without adding a new indexed SQLite column.
- Modify `scripts/check-render-effect-history-persistence.mjs`
  - Verify `motionIntensity` is preserved in history/event JSON and that no dedicated SQLite column is added.
- Modify `package.json`
  - Add all new checks to `npm run check`.
- Create `scripts/check-draft-language-guard.mjs`
  - Contract test for mojibake rejection.
- Create `scripts/check-provider-fallback-observability.mjs`
  - Contract test for provider response/fallback files.
- Create `scripts/check-final-duration-drift.mjs`
  - Contract test for short final output failure.
- Create fixture folder `tests/fixtures/bad-job-mojibake-draft/`
  - Minimal draft/job/render report reproducing this failure.
- Modify `timeline.md`
  - Add an implementation entry when the fix is completed.

---

### Task 1: Draft Language Guard

**Files:**
- Modify: `scripts/youtube-draft-quality.mjs`
- Create: `scripts/check-draft-language-guard.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `scripts/check-draft-language-guard.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { validateDraftQuality } from "./youtube-draft-quality.mjs";

const corruptedDraft = {
  title: "AI?? ?몄뀡 媛쒕컻???뚮옯??怨듦컻",
  structure: "HPSL",
  hpsl: {
    hook: { narration: "?몄뀡???쒕뵒??", target_seconds: 7 },
    point: { narration: "???뚮옯?쇱? AI瑜?", target_seconds: 13 },
    story: { narration: "?덈? ?ㅼ뼱, 媛쒕컻?먮뱾?", target_seconds: 30 },
    lesson: { narration: "寃곌뎅, AI? ?뚮옯?쇱쓽", target_seconds: 10 },
  },
  script: "?몄뀡???쒕뵒?? ???뚮옯?쇱? AI瑜? ?덈? ?ㅼ뼱, 媛쒕컻?먮뱾? 寃곌뎅, AI? ?뚮옯?쇱쓽",
  scenes: [
    { order: 1, narration: "?몄뀡???쒕뵒??", image_prompt: "AI tools on a desk" },
  ],
};

const result = validateDraftQuality({ draft: corruptedDraft, stage: "unit" });
assert.equal(result.ok, false, "mojibake Korean draft must fail");
assert.equal(result.failureCode, "CORRUPTED_KOREAN_DRAFT");

const goodDraft = {
  title: "AI 개발 플랫폼의 변화",
  structure: "HPSL",
  hpsl: {
    hook: { narration: "AI 개발 플랫폼이 일하는 방식을 바꾸고 있습니다.", target_seconds: 7 },
    point: { narration: "반복 업무 자동화가 핵심입니다.", target_seconds: 13 },
    story: { narration: "개발자는 코드 작성과 검토를 더 빠르게 반복할 수 있습니다.", target_seconds: 30 },
    lesson: { narration: "중요한 것은 도구를 목적에 맞게 쓰는 것입니다.", target_seconds: 10 },
  },
  script: "AI 개발 플랫폼이 일하는 방식을 바꾸고 있습니다. 반복 업무 자동화가 핵심입니다. 개발자는 코드 작성과 검토를 더 빠르게 반복할 수 있습니다. 중요한 것은 도구를 목적에 맞게 쓰는 것입니다.",
  scenes: [
    { order: 1, narration: "AI 개발 플랫폼이 일하는 방식을 바꾸고 있습니다.", image_prompt: "developer using AI tools" },
    { order: 2, narration: "반복 업무 자동화가 핵심입니다.", image_prompt: "automation dashboard without readable text" },
  ],
};

assert.equal(validateDraftQuality({ draft: goodDraft, stage: "unit" }).ok, true);
console.log(JSON.stringify({ ok: true, checked: "draft-language-guard" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/check-draft-language-guard.mjs
```

Expected: FAIL because `CORRUPTED_KOREAN_DRAFT` is not implemented.

- [ ] **Step 3: Implement the language guard**

In `scripts/youtube-draft-quality.mjs`, add helpers:

```js
function countMatches(text = "", pattern) {
  return Array.from(String(text).matchAll(pattern)).length;
}

function detectCorruptedKorean(text = "") {
  const value = normalizeText(text);
  if (value.length < 30) {
    return {
      hangulCount: countMatches(value, /[\uac00-\ud7af]/gu),
      hangulRatio: 0,
      mojibakeCount: 0,
      questionClusterCount: 0,
      corrupted: false,
    };
  }
  const hangulCount = countMatches(value, /[\uac00-\ud7af]/gu);
  const mojibakeCount = countMatches(value, /[�]|(?:\?[가-힣]?){2,}|[媛-힣][\u0080-\uffff]*|[李-璘]|[寃-힣]/gu);
  const questionClusterCount = countMatches(value, /\?{3,}/g);
  const hangulRatio = hangulCount / Math.max(1, Array.from(value).length);
  return {
    hangulCount,
    hangulRatio: Number(hangulRatio.toFixed(3)),
    mojibakeCount,
    questionClusterCount,
    corrupted: (
      (mojibakeCount >= 4 && hangulRatio < 0.2)
      || (questionClusterCount >= 4 && hangulRatio < 0.15)
      || (hangulCount < 4 && value.length > 30)
    ),
  };
}
```

Then after placeholder validation:

```js
const language = detectCorruptedKorean([
  draft.title,
  draft.script,
  ...scenes.map((scene) => scene?.narration),
].join(" "));

if (language.corrupted) {
  return {
    ok: false,
    failureCode: "CORRUPTED_KOREAN_DRAFT",
    reason: "Draft Korean text appears corrupted or mojibake.",
    stage,
    jobDir,
    language,
  };
}
```

- [ ] **Step 4: Add the check to `package.json`**

Insert `node ./scripts/check-draft-language-guard.mjs` immediately after `check-youtube-draft-quality.mjs` in the `check` script.

- [ ] **Step 5: Verify**

Run:

```bash
node scripts/check-draft-language-guard.mjs
npm.cmd run check
```

Expected: both pass.

---

### Task 2: Provider Boundary QA and Observability

**Files:**
- Modify: `automation/gemini-research-draft.mjs`
- Modify: `electron/services/youtube-draft-service.mjs`
- Create: `scripts/check-provider-fallback-observability.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing contract test**

Create `scripts/check-provider-fallback-observability.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const gemini = readFileSync(resolve(root, "automation/gemini-research-draft.mjs"), "utf8");
const openrouter = readFileSync(resolve(root, "electron/services/youtube-draft-service.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

assert.match(gemini, /provider-fallback-chain\.json/, "Gemini workflow should persist provider fallback chain");
assert.match(gemini, /assertDraftQuality/, "Gemini workflow should use shared draft QA before returning provider drafts");
assert.match(gemini, /shouldStopProviderFallback|failureClass/, "Gemini workflow should stop repeated structural provider failures");
assert.match(openrouter, /openrouter-response-/, "OpenRouter fallback should save raw provider responses");
assert.match(openrouter, /assertDraftQuality/, "OpenRouter fallback should reject bad Korean drafts before returning");
assert.ok(packageJson.scripts.check.includes("check-provider-fallback-observability"), "npm run check should include provider observability contract");

console.log(JSON.stringify({ ok: true, checked: "provider-fallback-observability" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/check-provider-fallback-observability.mjs
```

Expected: FAIL because fallback chain and OpenRouter raw response persistence are not implemented.

- [ ] **Step 3: Save provider chain in Gemini workflow**

In `automation/gemini-research-draft.mjs`, import `assertDraftQuality`:

```js
import { assertDraftQuality } from "../scripts/youtube-draft-quality.mjs";
```

Inside `buildGeminiResearchDraft`, create:

```js
const providerChain = [];
const saveProviderChain = async () => {
  await writeFile(join(jobDir, "provider-fallback-chain.json"), JSON.stringify(providerChain, null, 2), "utf8");
};
```

For every provider attempt, push:

```js
providerChain.push({
  provider: "gemini-gems",
  status: "failed",
  error: error.message,
  at: new Date().toISOString(),
});
await saveProviderChain();
```

Classify structural provider failures:

```js
function classifyProviderFailure(error = {}) {
  const code = error.code || error.qa?.failureCode || "";
  const message = String(error.message || "");
  if (code === "PLACEHOLDER_DRAFT" || /placeholder|schema/i.test(message)) return "placeholder-schema";
  if (code === "CORRUPTED_KOREAN_DRAFT" || /mojibake|corrupted korean/i.test(message)) return "corrupted-korean";
  if (/invalid JSON|JSON response was not detected/i.test(message)) return "invalid-json";
  return "provider-error";
}

function shouldStopProviderFallback(providerChain = []) {
  const structuralFailures = providerChain.filter((item) => (
    item.status === "failed"
    && ["placeholder-schema", "corrupted-korean"].includes(item.failureClass)
  ));
  const latest = structuralFailures.at(-1)?.failureClass || "";
  const sameClassCount = structuralFailures.filter((item) => item.failureClass === latest).length;
  return sameClassCount >= 2;
}
```

After Gems and normal Gemini both fail with the same structural class, stop before OpenRouter:

```js
if (shouldStopProviderFallback(providerChain)) {
  const latest = providerChain.at(-1);
  throw new Error(`Provider circuit breaker stopped fallback after repeated ${latest.failureClass} failures.`);
}
```

Do not use this circuit breaker for transient browser/network failures. OpenRouter fallback can still run when Gems/Gemini fail for login, timeout, or temporary browser automation issues.

When a provider succeeds, validate before returning:

```js
const normalized = normalizeYouTubeDraft(draft);
assertDraftQuality({ draft: normalized, job, stage: providerName, jobDir });
providerChain.push({ provider: providerName, status: "accepted", at: new Date().toISOString() });
await saveProviderChain();
return normalized;
```

- [ ] **Step 4: Save and validate OpenRouter fallback responses**

In `electron/services/youtube-draft-service.mjs`, import:

```js
import { assertDraftQuality } from "../../scripts/youtube-draft-quality.mjs";
```

In `buildDesktopYouTubeDraft`, after `requestDraft` returns:

```js
if (context.jobDir) {
  await writeFile(join(context.jobDir, `openrouter-response-${model.replace(/[^a-z0-9.-]+/gi, "_")}.json`), JSON.stringify(draft, null, 2), "utf8");
}
const normalized = normalizeYouTubeDraft(draft);
assertDraftMatchesSource(normalized, source);
assertDraftQuality({ draft: normalized, job, stage: `openrouter:${model}`, jobDir: context.jobDir || "" });
return normalized;
```

- [ ] **Step 5: Add the check to `package.json`**

Insert `node ./scripts/check-provider-fallback-observability.mjs` after `check-gemini-gems-priority.mjs`.

- [ ] **Step 6: Verify**

Run:

```bash
node scripts/check-provider-fallback-observability.mjs
npm.cmd run check
```

Expected: both pass.

---

### Task 3: Final Duration Drift Must Fail Both Directions

**Files:**
- Modify: `scripts/analyze-youtube-output.mjs`
- Create: `tests/fixtures/bad-job-short-duration/`
- Create: `scripts/check-final-duration-drift.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing check**

Create fixture files:

`tests/fixtures/bad-job-short-duration/job-request.json`

```json
{
  "id": "bad-job-short-duration",
  "sourceType": "keyword",
  "sourceValue": "AI 개발 플랫폼",
  "options": {
    "scriptStructure": "hpsl",
    "customDurationSeconds": 60
  }
}
```

`tests/fixtures/bad-job-short-duration/draft.json`

```json
{
  "title": "AI 개발 플랫폼",
  "structure": "HPSL",
  "hpsl": {
    "hook": { "narration": "AI 개발 플랫폼이 바뀌고 있습니다.", "target_seconds": 7 },
    "point": { "narration": "핵심은 자동화입니다.", "target_seconds": 13 },
    "story": { "narration": "개발자는 반복 작업을 줄일 수 있습니다.", "target_seconds": 30 },
    "lesson": { "narration": "도구를 목적에 맞게 써야 합니다.", "target_seconds": 10 }
  },
  "script": "AI 개발 플랫폼이 바뀌고 있습니다. 핵심은 자동화입니다. 개발자는 반복 작업을 줄일 수 있습니다. 도구를 목적에 맞게 써야 합니다.",
  "scenes": [
    { "order": 1, "narration": "AI 개발 플랫폼이 바뀌고 있습니다.", "image_prompt": "AI tools" }
  ]
}
```

`tests/fixtures/bad-job-short-duration/render-options.json`

```json
{
  "targetSeconds": 60
}
```

`tests/fixtures/bad-job-short-duration/render-report-v2.json`

```json
{
  "finalDuration": 27.87,
  "scenes": []
}
```

Create `scripts/check-final-duration-drift.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { analyzeYouTubeOutput } from "./analyze-youtube-output.mjs";

const result = analyzeYouTubeOutput(resolve(import.meta.dirname, "../tests/fixtures/bad-job-short-duration"));
assert.equal(result.ok, false, "short final duration should fail output QA");
assert.ok(result.failureCodes.includes("TARGET_DURATION_DRIFT"), "short duration drift should use TARGET_DURATION_DRIFT");
assert.equal(result.details.durationDrift, -32.13);

console.log(JSON.stringify({ ok: true, checked: "final-duration-drift" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/check-final-duration-drift.mjs
```

Expected: FAIL because negative drift currently does not fail.

- [ ] **Step 3: Implement bidirectional drift failure**

In `scripts/analyze-youtube-output.mjs`, replace:

```js
if (finalDuration && durationDrift > Math.max(3, expectedDuration * 0.08)) {
  failureCodes.push("TARGET_DURATION_DRIFT");
}
```

with:

```js
if (finalDuration && Math.abs(durationDrift) > Math.max(3, expectedDuration * 0.08)) {
  failureCodes.push("TARGET_DURATION_DRIFT");
}
```

- [ ] **Step 4: Add the check to `package.json`**

Insert `node ./scripts/check-final-duration-drift.mjs` in `check:final-output-qa`.

- [ ] **Step 5: Verify**

Run:

```bash
node scripts/check-final-duration-drift.mjs
npm.cmd run check:final-output-qa
npm.cmd run check
```

Expected: all pass.

---

### Task 4: Desktop Failure Persistence

**Files:**
- Modify: `electron/main.mjs`
- Create: `scripts/check-desktop-failure-persistence.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing contract test**

Create `scripts/check-desktop-failure-persistence.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const main = readFileSync(resolve(root, "electron/main.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

assert.match(main, /desktop-failure\.json/, "desktop failures should be persisted into the job folder");
assert.match(main, /input\?\.id|jobIdFromInput|lastJobDir/, "failure persistence should know which job directory to write to");
assert.match(main, /sanitizeFailurePayload|redactSensitive/, "desktop failure persistence should sanitize sensitive values");
assert.ok(packageJson.scripts.check.includes("check-desktop-failure-persistence"), "npm run check should include desktop failure persistence contract");

console.log(JSON.stringify({ ok: true, checked: "desktop-failure-persistence" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/check-desktop-failure-persistence.mjs
```

Expected: FAIL because `desktop-failure.json` is not written.

- [ ] **Step 3: Implement failure file persistence**

In `electron/main.mjs`, add a small sanitizer near the IPC handlers:

```js
function redactSensitive(key = "", value) {
  if (/api[_-]?key|token|cookie|password|secret|credential|authorization/i.test(String(key))) {
    return value ? "[REDACTED]" : value;
  }
  if (typeof value === "string" && /sk-[a-zA-Z0-9]|Bearer\s+[a-zA-Z0-9._-]+/i.test(value)) {
    return "[REDACTED]";
  }
  return value;
}

function sanitizeFailurePayload(value) {
  if (Array.isArray(value)) return value.map(sanitizeFailurePayload);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    redactSensitive(key, sanitizeFailurePayload(item)),
  ]));
}
```

Then derive the job id before calling `createYouTubeJob`:

```js
let activeJobDir = "";
```

After job creation begins or after `buildDesktopJobRequest` is available, ensure the catch block can write:

```js
if (activeJobDir) {
  await writeFile(join(activeJobDir, "desktop-failure.json"), JSON.stringify({
    ok: false,
    message: error?.message || String(error),
    stack: error?.stack || "",
    input: sanitizeFailurePayload(input),
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8").catch(() => {});
}
```

Keep this write non-fatal so it does not mask the real error.

- [ ] **Step 4: Add the check to `package.json`**

Insert `node ./scripts/check-desktop-failure-persistence.mjs` near `check:desktop-progress`.

- [ ] **Step 5: Verify**

Run:

```bash
node scripts/check-desktop-failure-persistence.mjs
npm.cmd run check
```

Expected: both pass.

---

### Task 5: Re-run Latest Failure as a Regression Fixture

**Files:**
- Create: `tests/fixtures/bad-job-1779789068109/`
- Create: `scripts/check-latest-failed-job-regression.mjs`
- Modify: `package.json`
- Modify: `timeline.md`

- [ ] **Step 1: Create a small fixture**

Copy these files from the failed job into `tests/fixtures/bad-job-1779789068109/`:

- `job-request.json`
- `draft.json`
- `render-options.json`
- `render-report-v2.json`
- `gemini-gems-response.txt`
- `gemini-response.txt`

Do not copy media files.

- [ ] **Step 2: Write the regression check**

Create `scripts/check-latest-failed-job-regression.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateDraftQuality } from "./youtube-draft-quality.mjs";
import { analyzeYouTubeOutput } from "./analyze-youtube-output.mjs";

const fixture = resolve(import.meta.dirname, "../tests/fixtures/bad-job-1779789068109");
const draft = JSON.parse(readFileSync(resolve(fixture, "draft.json"), "utf8"));
const draftQa = validateDraftQuality({ draft, stage: "regression", jobDir: fixture });
assert.equal(draftQa.ok, false, "latest failed job draft should be rejected");
assert.equal(draftQa.failureCode, "CORRUPTED_KOREAN_DRAFT");

const outputQa = analyzeYouTubeOutput(fixture);
assert.equal(outputQa.ok, false, "latest failed output should be rejected");
assert.ok(outputQa.failureCodes.includes("TARGET_DURATION_DRIFT"));

console.log(JSON.stringify({ ok: true, checked: "latest-failed-job-regression" }));
```

- [ ] **Step 3: Run test to verify it fails before the fixes**

Run:

```bash
node scripts/check-latest-failed-job-regression.mjs
```

Expected before Tasks 1 and 3 are complete: FAIL.

- [ ] **Step 4: Add the check to `package.json`**

Insert `node ./scripts/check-latest-failed-job-regression.mjs` after `check-final-duration-drift.mjs`.

- [ ] **Step 5: Update `timeline.md`**

Append:

```md
- 2026-05-26 HH:mm KST - 수정 - Gemini/Gems 대본 실패 케이스를 회귀 fixture로 고정하고, 한글 깨짐 draft와 목표 길이 미달 렌더를 hard fail로 승격했습니다. 영향 범위: draft QA, provider fallback, final output QA, desktop failure logging. 검증: `npm.cmd run check`.
```

- [ ] **Step 6: Verify**

Run:

```bash
node scripts/check-latest-failed-job-regression.mjs
npm.cmd run check
```

Expected: both pass.

---

### Task 6: Render Effect Strength and Randomized Scene Motion

**Files:**
- Modify: `youtube-job-schema.mjs`
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Modify: `electron/services/youtube-job-service.mjs`
- Modify: `electron/services/render-effect-presets.mjs`
- Modify: `electron/services/image-scene-renderer.mjs`
- Modify: `youtube-workflow-stages.mjs`
- Modify: `workflow-db-events.mjs`
- Modify: `scripts/check-render-effect-presets.mjs`
- Modify: `scripts/check-render-effect-history-persistence.mjs`
- Modify: `scripts/check-studio-v2-ux.mjs`
- Modify: `package.json`
- Modify: `timeline.md`

- [ ] **Step 1: Write the failing render effect strength contract**

Update `scripts/check-render-effect-presets.mjs` so it asserts three behavior levels:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { chooseSceneMotionPreset } from "../electron/services/render-effect-presets.mjs";

const none = chooseSceneMotionPreset({
  renderEffectPreset: "cinematic",
  motionIntensity: "none",
  order: 1,
  section: "hook",
});
assert.equal(none.name, "none", "none intensity should disable visible scene motion");

const light = chooseSceneMotionPreset({
  renderEffectPreset: "cinematic",
  motionIntensity: "light",
  order: 2,
  section: "point",
});
assert.ok(["slow-zoom-in", "slow-pull-back", "diagonal-drift", "tilt-reveal"].includes(light.name), "light intensity should use calm motion effects");

const strongSamples = Array.from({ length: 8 }, (_, index) => chooseSceneMotionPreset({
  renderEffectPreset: "dynamic-shorts",
  motionIntensity: "strong",
  order: index + 1,
  section: index === 0 ? "hook" : "story",
  visualCategory: index % 2 ? "risk-or-tension" : "core-fact-demo",
}).name);

assert.ok(strongSamples.some((name) => /push|whip|punch|zoom/i.test(name)), "strong intensity should allow more energetic motion");
assert.ok(new Set(strongSamples).size >= 2, "scene effects should vary across scenes instead of using one fixed effect");

console.log(JSON.stringify({ ok: true, checked: "render-effect-presets" }));
```

- [ ] **Step 2: Write the failing Studio UI contract**

Update `scripts/check-studio-v2-ux.mjs` with these assertions:

```js
assert.match(html, /value="none"[^>]*>효과없음</, "Studio should expose no render effect option");
assert.match(html, /value="light"[^>]*>약하게</, "Studio should expose light render effect option");
assert.match(html, /value="strong"[^>]*>강하게</, "Studio should expose strong render effect option");
assert.match(app, /motionIntensity:\s*[^,]+/, "renderer should submit motionIntensity");
assert.match(app, /효과없음|약하게|강하게/, "renderer preview should describe effect strength in Korean");
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
node scripts/check-render-effect-presets.mjs
node scripts/check-studio-v2-ux.mjs
```

Expected: FAIL because `none/light/strong` UI and effect selection are not implemented consistently.

- [ ] **Step 4: Update schema and desktop job payload**

In `youtube-job-schema.mjs`, normalize:

```js
const MOTION_INTENSITIES = new Set(["none", "light", "strong"]);
```

Map old values safely:

```js
function normalizeMotionIntensity(value = "light") {
  const normalized = String(value || "light").trim().toLowerCase();
  if (normalized === "medium") return "light";
  if (MOTION_INTENSITIES.has(normalized)) return normalized;
  throw new Error(`Unknown motionIntensity: ${value}`);
}
```

In `electron/services/youtube-job-service.mjs`, submit:

```js
motionIntensity: input.motionIntensity || "light",
```

Default should be `light`, not `strong`, so normal videos gain movement without looking chaotic.

- [ ] **Step 5: Update Electron UI**

In `electron/renderer/index.html`, change the render effect area so users choose strength:

```html
<label for="motionIntensity">렌더 효과 강도</label>
<select id="motionIntensity">
  <option value="none">효과없음</option>
  <option value="light" selected>약하게</option>
  <option value="strong">강하게</option>
</select>
```

Keep the existing style preset/effect family if useful, but the user-facing primary control must be the three strength choices.

In `electron/renderer/app.js`, submit:

```js
motionIntensity: document.querySelector("#motionIntensity")?.value || "light",
```

Update preview copy:

```js
const intensityLabels = {
  none: "효과없음: 정적인 장면 위주로 안정적으로 렌더합니다.",
  light: "약하게: 장면마다 은은한 줌/팬 효과를 랜덤 적용합니다.",
  strong: "강하게: 초반 집중도를 위해 더 역동적인 줌/팬 효과를 랜덤 적용합니다.",
};
```

- [ ] **Step 6: Implement randomized scene motion**

In `electron/services/render-effect-presets.mjs`, split libraries by intensity:

```js
const MOTION_BY_INTENSITY = {
  none: [{ name: "none", fps: 30 }],
  light: [
    { name: "slow-zoom-in", fps: 30 },
    { name: "slow-pull-back", fps: 30 },
    { name: "diagonal-drift", fps: 30 },
    { name: "tilt-reveal", fps: 30 },
  ],
  strong: [
    { name: "hook-punch-zoom", fps: 30 },
    { name: "cinematic-push-in", fps: 30 },
    { name: "diagonal-drift", fps: 30 },
    { name: "tilt-reveal", fps: 30 },
  ],
};
```

Use deterministic randomization so rerenders of the same scene are stable but adjacent scenes vary:

```js
function hashSeed(parts = []) {
  const text = parts.join("|");
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

export function chooseSceneMotionPreset({
  renderEffectPreset = "cinematic",
  motionIntensity = "light",
  order = 1,
  section = "",
  visualCategory = "",
} = {}) {
  const intensity = ["none", "light", "strong"].includes(motionIntensity) ? motionIntensity : "light";
  const library = MOTION_BY_INTENSITY[intensity];
  if (intensity === "none") return library[0];
  const seed = hashSeed([renderEffectPreset, intensity, order, section, visualCategory]);
  return library[seed % library.length];
}
```

- [ ] **Step 7: Make image renderer respect no-effect mode**

In `electron/services/image-scene-renderer.mjs`, add a preset for `none`:

```js
none: "zoom='1':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frameCount}:s=1080x1920:fps=30",
```

This keeps image-mode scenes from looking broken while still producing a valid video clip for the final timeline.

- [ ] **Step 8: Pass intensity into workflow stage**

In `youtube-workflow-stages.mjs`, update the image-scene motion call:

```js
const motion = chooseSceneMotionPreset({
  renderEffectPreset: job?.options?.renderEffectPreset || "cinematic",
  motionIntensity: job?.options?.motionIntensity || "light",
  order: scene.order,
  section: scene.section,
  visualCategory: scene.visual_category,
});
```

Also include `motionIntensity` in progress `details` and `render-report-v2.json` if the render script already records it.

- [ ] **Step 9: Preserve intensity in history without adding SQLite columns**

Update `workflow-db-events.mjs` payload:

```js
motionIntensity: event.details?.motionIntensity || event.job?.options?.motionIntensity || event.input?.motionIntensity || "",
```

Update `electron/main.mjs` job index write:

```js
motionIntensity: result.job.options?.motionIntensity || "light",
```

Update `scripts/check-render-effect-history-persistence.mjs`:

```js
assert.match(main, /motionIntensity/, "desktop job history should preserve motion intensity");
assert.match(workflowDbEvents, /motionIntensity/, "workflow DB events should mirror motion intensity in JSON details");
assert.doesNotMatch(dbHelper, /ALTER TABLE jobs ADD COLUMN motion_intensity/, "do not add motion_intensity SQLite column until a query UI needs it");
```

Do not add `motion_intensity` to the SQLite `jobs` table in this phase. The existing `workflow_json` and event JSON are the intended persistence layer for these render options.

- [ ] **Step 10: Verify**

Run:

```bash
node scripts/check-render-effect-presets.mjs
node scripts/check-studio-v2-ux.mjs
node scripts/check-render-effect-history-persistence.mjs
npm.cmd run check:flow-output-mode
npm.cmd run check
```

Expected: all pass.

- [ ] **Step 11: Update `timeline.md`**

Append:

```md
- 2026-05-26 HH:mm KST - 기능 추가 - 렌더 효과 강도를 `효과없음`, `약하게`, `강하게`로 단순화하고, 선택 강도에 따라 장면별 줌/팬 모션을 안정적으로 랜덤 적용하도록 계획했습니다. 영향 범위: Electron UI, job schema, render effect presets, image scene renderer. 검증: `npm.cmd run check`.
```

---

## Acceptance Criteria

- Gems and normal Gemini schema-example responses are logged and rejected with a clear provider failure chain.
- OpenRouter fallback cannot return mojibake Korean draft silently.
- A corrupted Korean draft never reaches Google Flow generation.
- A final video that is 27.87 seconds for a 60 second request fails final output QA.
- Desktop failures write `desktop-failure.json` into the job directory when a job directory exists.
- Render effect strength is selectable as `효과없음`, `약하게`, `강하게`.
- `효과없음` produces valid clips without visible zoom/pan.
- `약하게` applies subtle randomized scene motion so image-mode sections are not static.
- `강하게` applies stronger randomized scene motion suitable for short-form attention hooks.
- Randomized render effects are deterministic per scene, so rerunning the same job does not unexpectedly change the final video.
- Mojibake detection uses ratio-based checks so normal Korean scripts with question marks are not falsely rejected.
- Repeated placeholder/corrupted provider responses stop via a circuit breaker before unnecessary fallback work continues.
- Failure artifacts redact sensitive keys and token-like values before writing `desktop-failure.json`.
- `motionIntensity` is preserved in workflow/event/job-history JSON without adding a dedicated SQLite column.
- `npm.cmd run check` passes.
- `timeline.md` records the implemented fix after execution.

## Execution Notes

- Do not regenerate Flow media while implementing this fix. Use the existing failed job fixture.
- Keep the current shared workflow architecture; do not split Hermes and Electron again.
- Prefer hard fail with actionable UI details over silent fallback when generated text is corrupted.
