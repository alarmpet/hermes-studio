# Recent Workflow Failure Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the recent Hermes Studio failures where longform/shorts settings submit inconsistent jobs, Gemini/Gems draft jobs hang or fail without recovery, and Google Flow hybrid/video mode cannot switch away from Nano Banana Pro image mode.

**Architecture:** Add hard validation at the UI and backend job-normalization boundary, make Flow output-mode switching target the actual model/settings chip instead of the Agent chip, and persist complete failure diagnostics even when a provider/browser run is interrupted. Keep fixes small and testable through existing smoke scripts plus new regression checks.

**Tech Stack:** Electron renderer/main, Playwright browser automation, Google Flow web UI automation, Node.js JSON contract tests, Hermes workflow job schema.

---

## Evidence From Recent Failed Jobs

### Research/Draft/Prompt Quality Findings

The recent logs show that research and draft quality also need hard gates, not only runtime fixes.

**Job `youtube-1779865917344`**

- Source keyword: `최신 gemini 소식`.
- Provider status: `gemini-gems` accepted.
- Draft title: `눈만 뜨면 AI 뉴스, 나만 뒤처지는 것 같은 진짜 이유`.
- Problem: the accepted script drifts from "latest Gemini news" into generic AI infrastructure/data-center/energy discussion.
- Problem: the exact subject `gemini` is not meaningfully present in the title or first narration sentence.
- Problem: the raw Gems response had `structure: "Hybrid"` rather than `HPSL`, and `hpsl` sections appeared as plain strings before normalization.
- Problem: the raw scene prompts included `aspect ratio 16:9`, while Hermes Shorts/Flow output should enforce `9:16`.
- Risk: Hermes can proceed to Flow with a draft that passes loose validation but does not answer the user's keyword.

**Job `youtube-1779864907092`**

- Source URL: `https://n.news.naver.com/mnews/hotissue/article/081/0003646883?type=series&cid=1089231`.
- No `draft.json` was produced, so final script/prompt quality could not be assessed.
- Gems failed with placeholder/schema failures.
- Gemini failed once with placeholder/schema output and once with a duration-contract failure.
- OpenRouter failed because the job was incorrectly submitted as a 720-second Shorts target.
- Risk: without early `job-request.json` persistence, failed draft jobs are hard to audit for source grounding and normalized settings.

**Code-level quality gaps found**

- `automation/gemini-research-draft.mjs` `assertUsefulDraft()` only checks whether any keyword token appears anywhere in the combined draft. Generic words such as `최신` can satisfy the guard even if the actual subject `Gemini` is missing.
- `scripts/youtube-draft-quality.mjs` `validateHpslStructure()` returns `ok: true` when `structure` is not `HPSL`, which lets malformed Gems responses pass.
- `normalizeYouTubeDraft()` can normalize malformed HPSL-ish provider output into a usable shape, but QA does not preserve a warning that provider schema was malformed.
- Current draft QA does not reject Flow prompts that say `aspect ratio 16:9` for vertical Shorts jobs.

**Review validation notes from `HERMES_WORKFLOW_FAILURE_FIX_REVIEW.md`**

- Valid: keep the Flow model selector fix focused on excluding the Agent chip and selecting the real model/settings chip.
- Valid: keyword grounding needs Korean josa trimming so inputs such as `gemini의 소식` or `제미나이를 분석` do not create false `SOURCE_GROUNDING_MISMATCH` failures.
- Valid: atomic provider-chain writes need Windows `rename()` retry/backoff for transient `EACCES` and `EPERM` file-lock errors.
- Valid with scope adjustment: SQLite diagnostics should record structured failure codes, but this plan should not require a broad DB schema migration. Store a `failureCode` field in the mirrored JSON payload and prefix `task_failures.error_msg` with `[FAILURE_CODE]` so `/diagnose` can group failures immediately.

### Job `youtube-1779865917344`

**Observed failure:** `Google Flow output mode mismatch. Requested video, but Flow UI appears to be image.`

**Inputs:**
- `videoFormat`: `shorts`
- `flowOutputMode`: `hybrid`
- `hybridIntroVideoSceneCount`: `1`
- scene 1 requested `video`

**Evidence files:**
- `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779865917344\desktop-failure.json`
- `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779865917344\scene_1_flow_mode_mismatch.png`
- `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779865917344\scene_1_flow_mode_switch.json`

**Root cause hypothesis:** `automation/google-flow-output-mode.mjs` picks the lower-left `에이전트` chip as the generator chip. Clicking that chip does not open the model/output-mode menu, so video labels are never found. The actual model chip is the `Nano Banana Pro crop_9_16 1x` chip on the right side of the prompt bar.

### Job `youtube-1779864907092`

**Observed failure:** `OpenRouter draft generation failed ... Draft narration is too short for 720s target.`

**Inputs:**
- `videoFormat`: `shorts`
- `scriptLengthMode`: `custom`
- `customDurationSeconds`: `720`
- `enableLiveMcp`: `true`
- `flowOutputMode`: `hybrid`
- `researchProvider`: `gemini-gems-browser`

**Root cause:** UI allowed a mixed state: a 720-second longform duration and hybrid/live-MCP behavior were submitted while `videoFormat` remained `shorts`. Backend then treated the request as a shorts job with a 720-second target, so all short-form providers returned drafts that failed duration QA.

### Job `youtube-1779865587019`

**Observed failure:** `provider-fallback-chain.json` is zero bytes and no `desktop-failure.json` exists.

**Evidence files:**
- `gemini-gems-request.txt`
- `gemini-gems-repair-request.txt`
- empty `provider-fallback-chain.json`

**Root cause hypothesis:** Provider execution was interrupted, browser was closed, or the app process exited while fallback-chain persistence was open. The workflow did not atomically write provider-chain snapshots and did not create a final diagnostic failure object for interrupted provider jobs.

---

## File Responsibility Map

- `automation/google-flow-output-mode.mjs`: Detect and switch Flow image/video generator mode. Must select the model/settings chip, not the Agent chip.
- `scripts/check-flow-output-mode-contract.mjs`: Regression checks for image/video/hybrid Flow mode automation.
- `electron/renderer/app.js`: UI state synchronization and submit-time validation for Shorts vs Longform.
- `electron/renderer/index.html`: User-facing warnings/hints if necessary.
- `youtube-job-schema.mjs`: Backend guardrail against invalid `shorts + 600s+` or mixed longform options.
- `electron/services/youtube-job-service.mjs`: Persist normalized job request early enough to debug pre-draft failures.
- `automation/gemini-research-draft.mjs`: Provider fallback-chain atomic write and interrupted-run failure classification.
- `scripts/check-longform-ui-workflow-guards.mjs`: Regression test for longform/shorts submit consistency.
- `scripts/check-provider-fallback-observability.mjs`: Regression test for non-empty provider fallback logs and interrupted diagnostics.
- `timeline.md`: Record architecture/workflow changes.

---

## Task 1: Fix Google Flow Model Chip Selection

**Files:**
- Modify: `C:\Users\amd\hermes\automation\google-flow-output-mode.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-flow-output-mode-contract.mjs`

- [ ] **Step 1: Add a failing contract assertion**

Add a text-level assertion that the Flow model-chip selector excludes Agent chips and prefers model labels:

```js
const flowOutputMode = readFileSync(resolve(root, "automation/google-flow-output-mode.mjs"), "utf8");
assert.match(flowOutputMode, /agent|에이전트|\\uc5d0\\uc774\\uc804\\ud2b8/i, "Flow selector should explicitly know Agent chips are not model chips");
assert.match(flowOutputMode, /Nano Banana|Veo|crop_9_16|9:16/, "Flow selector should prefer the model/settings chip");
assert.match(flowOutputMode, /isModelSettingsChip/, "Flow selector should use a dedicated model/settings chip predicate");
```

Run:

```powershell
node scripts/check-flow-output-mode-contract.mjs
```

Expected: FAIL because `isModelSettingsChip` does not exist.

- [ ] **Step 2: Implement `isAgentChip` and `isModelSettingsChip` inside page evaluation**

In `findBottomGeneratorChip`, replace “largest bottom non-create button” selection with a ranked predicate:

```js
const isAgentChip = (text) => /agent|에이전트|\uc5d0\uc774\uc804\ud2b8/i.test(text);
const isModelSettingsChip = (text) => /Nano Banana|Imagen|Veo|crop_9_16|9:16|1x|16:9|00:10|videocam|image|video|\uc774\ubbf8\uc9c0|\ub3d9\uc601\uc0c1/i.test(text)
  && !isAgentChip(text);
const candidates = controls().filter((item) => {
  const text = item.text;
  return item.el.matches("button,[role='button']")
    && item.rect.y > window.innerHeight * 0.64
    && !/arrow_forward|create|generate|\ub9cc\ub4e4\uae30/i.test(text)
    && isModelSettingsChip(text);
});
```

Sort by strongest model evidence:

```js
}).sort((a, b) => {
  const score = (item) => [
    /Veo|Nano Banana|Imagen/i.test(item.text) ? 10 : 0,
    /crop_9_16|9:16|16:9|1x/i.test(item.text) ? 5 : 0,
    /\ub3d9\uc601\uc0c1|\uc774\ubbf8\uc9c0|video|image/i.test(item.text) ? 3 : 0,
    item.rect.width * item.rect.height / 10000,
  ].reduce((sum, value) => sum + value, 0);
  return score(b) - score(a);
});
```

- [ ] **Step 3: Run Flow mode contract**

Run:

```powershell
node scripts/check-flow-output-mode-contract.mjs
node --check automation/google-flow-output-mode.mjs
```

Expected: PASS.

- [ ] **Step 4: Manually verify with the failed job state**

Run a small keyword job with `flowOutputMode=hybrid`, `hybridIntroVideoSceneCount=1`.

Expected:
- scene 1 verification reports `selectedOutputMode: "video"`.
- later scenes report `selectedOutputMode: "image"`.
- no `scene_1_flow_mode_mismatch.png` is produced.

---

## Task 2: Prevent Shorts + 720s Mixed Jobs

**Files:**
- Modify: `C:\Users\amd\hermes\electron\renderer\app.js`
- Modify: `C:\Users\amd\hermes\youtube-job-schema.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-longform-ui-workflow-guards.mjs`

- [ ] **Step 1: Add backend regression test**

In `scripts/check-longform-ui-workflow-guards.mjs`, add:

```js
assert.throws(
  () => normalizeYouTubeJobRequest({
    sourceType: "url",
    sourceValue: "https://example.com/news",
    options: {
      videoFormat: "shorts",
      scriptLengthMode: "custom",
      customDurationSeconds: 720,
      flowOutputMode: "hybrid",
      enableLiveMcp: true,
    },
  }),
  /Longform mode is required|shorts duration/i,
);
```

Run:

```powershell
node scripts/check-longform-ui-workflow-guards.mjs
```

Expected: FAIL until backend guard is added.

- [ ] **Step 2: Add backend guard in `youtube-job-schema.mjs`**

After `options.customDurationSeconds` is parsed:

```js
if (options.videoFormat === "shorts" && Number(options.customDurationSeconds || 0) >= 600) {
  throw new Error("Longform mode is required for durations of 600 seconds or longer.");
}
if (options.videoFormat === "shorts" && options.enableLiveMcp && options.researchProvider === "notebooklm-mcp") {
  throw new Error("NotebookLM live MCP research is reserved for Longform mode unless explicitly enabled by a future advanced setting.");
}
```

- [ ] **Step 3: Add submit-time UI validation**

In `readJobInput()` or immediately before submit, add:

```js
function validateJobInput(input) {
  const errors = [];
  if (input.videoFormat === "shorts" && input.scriptLengthMode === "custom" && Number(input.customDurationSeconds || 0) >= 600) {
    errors.push("600초 이상 영상은 Longform을 선택해야 합니다.");
  }
  if (input.videoFormat === "shorts" && input.enableLiveMcp && input.researchProvider === "notebooklm-mcp") {
    errors.push("NotebookLM MCP 자료조사는 Longform에서 사용하는 것을 권장합니다.");
  }
  return errors;
}
```

Before `youtube:createJob`, block submit:

```js
const input = readJobInput();
const validationErrors = validateJobInput(input);
if (validationErrors.length) {
  appendLog("입력 설정 오류", validationErrors.join("\n"));
  currentProgressMessage.textContent = validationErrors[0];
  return;
}
```

- [ ] **Step 4: Ensure Longform radio synchronizes dependent fields**

When Longform is selected, keep existing behavior:

```js
scriptLengthMode.value = "custom";
customDurationSeconds.value = String(getLongformTargetSeconds());
flowOutputModeHybrid.checked = true;
researchProvider.value = "notebooklm-mcp";
enableLiveMcp.checked = true;
```

When Shorts is selected, reset unsafe longform-only values:

```js
if (getVideoFormat() === "shorts") {
  if (Number(customDurationSeconds.value || 0) >= 600) customDurationSeconds.value = "60";
  if (researchProvider?.value === "notebooklm-mcp") researchProvider.value = "gemini-gems-browser";
  if (enableLiveMcp) enableLiveMcp.checked = false;
}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
node scripts/check-longform-ui-workflow-guards.mjs
node scripts/check-youtube-job-schema.mjs
npm.cmd run check:studio-inputs
```

Expected: PASS.

---

## Task 3: Make Provider Fallback Logs Atomic and Non-Empty

**Files:**
- Modify: `C:\Users\amd\hermes\automation\gemini-research-draft.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-provider-fallback-observability.mjs`

- [ ] **Step 1: Add test for atomic writes**

In `scripts/check-provider-fallback-observability.mjs`, assert source contains temp-write/rename pattern:

```js
assert.match(geminiResearch, /provider-fallback-chain\.json\.tmp/, "Provider fallback chain should write to a temp file first");
assert.match(geminiResearch, /rename\(/, "Provider fallback chain should atomically rename temp file into place");
assert.match(geminiResearch, /EACCES|EPERM/, "Atomic provider writes should retry transient Windows file-lock errors");
assert.match(geminiResearch, /delay\(100|100\s*\*\s*attempt/, "Atomic provider writes should use a small retry backoff");
assert.match(geminiResearch, /interrupted|aborted|provider-run-incomplete/i, "Provider interruptions should be classified");
```

Run:

```powershell
node scripts/check-provider-fallback-observability.mjs
```

Expected: FAIL until implementation is added.

- [ ] **Step 2: Implement atomic provider-chain persistence**

Replace direct writes with:

```js
async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeJsonAtomic(path, value) {
  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, JSON.stringify(value, null, 2), "utf8");
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await rename(tmpPath, path);
      return;
    } catch (error) {
      const retryable = /EACCES|EPERM/i.test(error?.code || error?.message || "");
      if (!retryable || attempt === 3) throw error;
      await delay(100 * attempt);
    }
  }
}
```

Every time provider status changes, call `writeJsonAtomic(providerChainPath, chain)`.

- [ ] **Step 3: Add final catch/finally diagnostic**

At provider orchestration boundary:

```js
try {
  // provider chain
} catch (error) {
  chain.push({
    provider: activeProvider || "unknown",
    status: "failed",
    failureClass: classifyProviderFailure(error) || "provider-run-incomplete",
    error: error?.message || String(error),
    at: new Date().toISOString(),
  });
  await writeJsonAtomic(providerChainPath, chain);
  throw error;
}
```

- [ ] **Step 4: Run observability tests**

Run:

```powershell
node scripts/check-provider-fallback-observability.mjs
node scripts/check-desktop-failure-persistence.mjs
```

Expected: PASS.

---

## Task 4: Persist Job Request Before Draft Provider Starts

**Files:**
- Modify: `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-desktop-job-id-consistency.mjs`

- [ ] **Step 1: Add regression assertion**

Assert `youtube-job-service.mjs` writes `job-request.json` before `runYouTubeJob`:

```js
const writeIndex = service.indexOf("job-request.json");
const runIndex = service.indexOf("runYouTubeJob");
assert.ok(writeIndex >= 0 && writeIndex < runIndex, "Desktop job request should be written before workflow execution starts");
```

- [ ] **Step 2: Implement early job request persistence**

Immediately after `mkdir(jobDir)` and character sheet ingest:

```js
await writeFile(join(jobDir, "job-request.json"), JSON.stringify(job, null, 2), "utf8");
```

This guarantees failures before `runYouTubeJob` still have normalized job evidence.

- [ ] **Step 3: Run tests**

Run:

```powershell
node scripts/check-desktop-job-id-consistency.mjs
node scripts/check-desktop-failure-persistence.mjs
```

Expected: PASS.

---

## Task 5: Improve User-Facing Failure Messages

**Files:**
- Modify: `C:\Users\amd\hermes\electron\renderer\app.js`
- Modify: `C:\Users\amd\hermes\electron\services\job-progress-events.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-desktop-progress-feedback.mjs`

- [ ] **Step 1: Add message mapping for common failures**

Add a renderer helper:

```js
function explainFailure(message = "") {
  if (/output mode mismatch/i.test(message)) {
    return "Google Flow의 이미지/영상 모드 전환에 실패했습니다. Flow 설정 칩을 다시 선택해 재시도합니다.";
  }
  if (/too short for 720s target/i.test(message)) {
    return "720초 대본 요청인데 현재 작업이 Shorts로 제출되었습니다. Longform을 선택해야 합니다.";
  }
  if (/provider-fallback-chain/i.test(message) || /Gemini JSON response was not detected/i.test(message)) {
    return "자료 조사/대본 생성 Provider가 정상 JSON을 반환하지 못했습니다. Gemini Gems 인증 또는 일반 Gemini fallback 상태를 확인해야 합니다.";
  }
  return message;
}
```

- [ ] **Step 2: Show actionable recovery actions**

For flow mismatch:
- Show `Retry Failed Scenes`.

For draft duration mismatch:
- Show “Longform으로 전환” hint.

For provider interruption:
- Show “Retry draft generation” hint.

- [ ] **Step 3: Run feedback test**

Run:

```powershell
npm.cmd run check:desktop-progress
```

Expected: PASS.

---

## Task 6: End-to-End Regression Runs

**Files:**
- Use existing scripts:
  - `C:\Users\amd\hermes\scripts\run-url-ui-workflow-live.mjs`

- [ ] **Step 1: Shorts hybrid keyword regression**

Run a 60-second keyword job:

```powershell
$env:HERMES_SCRIPT_PRESET='standard'
$env:HERMES_FLOW_MODE='hybrid'
node scripts/run-url-ui-workflow-live.mjs 'keyword:최신 gemini 소식'
```

Expected:
- scene 1 uses video mode successfully.
- later scenes use image mode.
- no Flow mode mismatch.

If `run-url-ui-workflow-live.mjs` does not support `keyword:` input yet, add a small `scripts/run-keyword-ui-workflow-live.mjs` wrapper.

- [ ] **Step 2: Longform guard regression**

Try submitting `shorts + 720s`.

Expected:
- UI blocks submission before creating a job.
- Backend also rejects direct call with `Longform mode is required`.

- [ ] **Step 3: Real longform smoke**

Submit Longform with:
- `longformTargetSeconds`: `720`
- `introVideoClipCount`: `10`
- `bodyImageSeconds`: `18`
- `researchProvider`: `notebooklm-mcp`

Expected:
- normalized job has `videoFormat: "longform"`.
- `customDurationSeconds: 720`.
- `flowOutputMode: "hybrid"`.
- no shorts provider tries to create a 720s short draft.

- [ ] **Step 4: Full verification**

Run:

```powershell
npm.cmd run check
npm.cmd run electron:pack
node scripts/check-packaged-render-runner.mjs
node scripts/check-packaged-auth-account-switching.mjs
node scripts/check-desktop-shortcut-launcher.mjs
```

Expected: all PASS.

---

## Task 7: Add Source-Grounded Draft QA

**Files:**
- Modify: `C:\Users\amd\hermes\automation\gemini-research-draft.mjs`
- Modify: `C:\Users\amd\hermes\scripts\youtube-draft-quality.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-youtube-draft-quality.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-hpsl-qa-gate.mjs`

- [ ] **Step 1: Add a failing keyword-grounding test**

In `scripts/check-youtube-draft-quality.mjs`, add a regression based on the recent bad accepted output:

```js
const geminiKeywordJob = {
  sourceType: "keyword",
  sourceValue: "최신 gemini 소식",
  options: { scriptStructure: "hpsl", aspectRatio: "9:16" },
};

const genericAiDraft = {
  title: "눈만 뜨면 AI 뉴스, 나만 뒤처지는 것 같은 진짜 이유",
  structure: "HPSL",
  hpsl: {
    hook: { narration: "매일 아침 AI 뉴스가 쏟아집니다.", target_seconds: 7 },
    point: { narration: "핵심은 데이터센터와 전력 경쟁입니다.", target_seconds: 13 },
    story: { narration: "거대 기업들이 인프라를 확장하고 있습니다.", target_seconds: 30 },
    lesson: { narration: "기술 이름보다 구조를 봐야 합니다.", target_seconds: 10 },
  },
  script: "매일 아침 AI 뉴스가 쏟아집니다. 핵심은 데이터센터와 전력 경쟁입니다. 거대 기업들이 인프라를 확장하고 있습니다. 기술 이름보다 구조를 봐야 합니다.",
  scenes: [
    { order: 1, narration: "매일 아침 AI 뉴스가 쏟아집니다.", image_prompt: "9:16 cinematic data center scene" },
  ],
};

const groundingResult = validateDraftQuality({
  draft: genericAiDraft,
  job: geminiKeywordJob,
  stage: "unit-keyword-grounding",
});
assert.equal(groundingResult.ok, false, "draft must not pass when the required keyword subject Gemini is missing");
assert.equal(groundingResult.failureCode, "SOURCE_GROUNDING_MISMATCH");

const josaKeywordJob = {
  sourceType: "keyword",
  sourceValue: "gemini의 소식",
  options: { scriptStructure: "hpsl", aspectRatio: "9:16" },
};
const josaDraft = {
  ...genericAiDraft,
  title: "Gemini 최신 변화",
  script: "Gemini가 바꾸는 검색 경험을 쉽게 설명합니다.",
  hpsl: {
    hook: { narration: "Gemini가 검색을 바꾸고 있습니다.", target_seconds: 7 },
    point: { narration: "핵심은 답변 방식의 변화입니다.", target_seconds: 13 },
    story: { narration: "사용자는 긴 검색 대신 요약된 맥락을 먼저 봅니다.", target_seconds: 30 },
    lesson: { narration: "도구 변화는 습관 변화로 이어집니다.", target_seconds: 10 },
  },
  scenes: [{ order: 1, narration: "Gemini가 검색을 바꾸고 있습니다.", image_prompt: "9:16 cinematic browser search workflow" }],
};
assert.equal(validateDraftQuality({ draft: josaDraft, job: josaKeywordJob, stage: "unit-keyword-josa" }).ok, true);
assert.equal(validateDraftQuality({ draft: josaDraft, job: { ...josaKeywordJob, sourceValue: "제미나이를 분석" }, stage: "unit-korean-josa" }).ok, true);
```

Run:

```powershell
node scripts/check-youtube-draft-quality.mjs
```

Expected: FAIL until `validateDraftQuality` checks required source tokens.

- [ ] **Step 2: Implement required keyword token extraction**

In `scripts/youtube-draft-quality.mjs`, add:

```js
function requiredKeywordTokens(sourceValue = "") {
  const stopwords = new Set(["최신", "소식", "뉴스", "이슈", "기사", "정리", "요약", "영상", "유튜브"]);
  return String(sourceValue || "")
    .split(/\s+/)
    .map((token) => token.trim())
    .map((token) => cleanJosa(token))
    .filter((token) => token.length >= 2)
    .filter((token) => !stopwords.has(token.toLowerCase()));
}

function cleanJosa(token = "") {
  return String(token)
    .replace(/(?:으로|로|에서|에게|한테|와|과|을|를|이|가|은|는|의|도|만|에)$/u, "")
    .trim();
}
```

In `validateDraftQuality({ draft, job, stage, jobDir })`, add:

```js
if (job?.sourceType === "keyword") {
  const requiredTokens = requiredKeywordTokens(job.sourceValue);
  const haystack = normalizeText([
    draft.title,
    draft.script,
    ...scenes.map((scene) => scene?.narration),
  ].join(" ")).toLowerCase();
  const missingTokens = requiredTokens.filter((token) => !haystack.includes(token.toLowerCase()));
  if (missingTokens.length) {
    return {
      ok: false,
      failureCode: "SOURCE_GROUNDING_MISMATCH",
      reason: `Draft does not include required keyword subject: ${missingTokens.join(", ")}`,
      missingTokens,
      stage,
      jobDir,
    };
  }
}
```

- [ ] **Step 3: Pass `job` into all draft quality calls**

Find every call:

```powershell
rg -n "validateDraftQuality|assertDraftQuality" .
```

Ensure calls include the normalized job:

```js
validateDraftQuality({ draft, job, stage: "research" });
assertDraftQuality({ draft, job, stage: "research" });
```

- [ ] **Step 4: Run quality checks**

Run:

```powershell
node scripts/check-youtube-draft-quality.mjs
node scripts/check-provider-fallback-observability.mjs
npm.cmd run check:final-output-qa
```

Expected: PASS.

---

## Task 8: Reject Malformed HPSL and Wrong Aspect Prompts

**Files:**
- Modify: `C:\Users\amd\hermes\scripts\youtube-draft-quality.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-hpsl-qa-gate.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-flow-prompt-safety.mjs`

- [ ] **Step 1: Add a failing malformed HPSL test**

In `scripts/check-hpsl-qa-gate.mjs`, add:

```js
const malformedHybridDraft = {
  title: "AI 뉴스",
  structure: "Hybrid",
  hpsl: {
    hook: "문자열 후킹",
    point: "문자열 포인트",
    story: "문자열 스토리",
    lesson: "문자열 교훈",
  },
  script: "AI 뉴스 이야기입니다.",
  scenes: [{ order: 1, narration: "AI 뉴스 이야기입니다.", image_prompt: "aspect ratio 16:9" }],
};

const malformedResult = validateDraftQuality({
  draft: malformedHybridDraft,
  job: { options: { scriptStructure: "hpsl", aspectRatio: "9:16" } },
  stage: "unit-hpsl-malformed",
});
assert.equal(malformedResult.ok, false);
assert.equal(malformedResult.failureCode, "HPSL_STRUCTURE_MISMATCH");
```

Run:

```powershell
node scripts/check-hpsl-qa-gate.mjs
```

Expected: FAIL until HPSL structure is strict.

- [ ] **Step 2: Make HPSL strict when job expects HPSL**

Change `validateHpslStructure(draft, stage, jobDir)` to accept `job`:

```js
function validateHpslStructure(draft = {}, stage = "", jobDir = "", job = {}) {
  const expectsHpsl = String(job?.options?.scriptStructure || "hpsl").toLowerCase() === "hpsl";
  if (expectsHpsl && String(draft.structure || "").toUpperCase() !== "HPSL") {
    return {
      ok: false,
      failureCode: "HPSL_STRUCTURE_MISMATCH",
      reason: `Expected HPSL draft but got "${draft.structure || "missing"}".`,
      stage,
      jobDir,
    };
  }
  const required = ["hook", "point", "story", "lesson"];
  for (const sectionName of required) {
    const section = draft.hpsl?.[sectionName];
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      return {
        ok: false,
        failureCode: "HPSL_SECTION_MISSING",
        reason: `HPSL section "${sectionName}" must be an object with narration and target_seconds.`,
        missingSection: sectionName,
        stage,
        jobDir,
      };
    }
  }
}
```

- [ ] **Step 3: Reject wrong aspect ratio prompts for vertical jobs**

In `validateDraftQuality`, add:

```js
for (const scene of scenes) {
  const prompt = normalizeText(scene?.image_prompt);
  if ((job?.options?.aspectRatio || "9:16") === "9:16" && /aspect ratio 16:9|\b16:9\b/i.test(prompt) && !/9:16/i.test(prompt)) {
    return {
      ok: false,
      failureCode: "FLOW_PROMPT_ASPECT_MISMATCH",
      reason: `Scene ${scene.order || "?"} prompt requests 16:9 for a 9:16 job.`,
      failedSceneOrder: Number(scene.order || 0),
      stage,
      jobDir,
    };
  }
}
```

- [ ] **Step 4: Run HPSL and prompt QA**

Run:

```powershell
node scripts/check-hpsl-qa-gate.mjs
node scripts/check-flow-prompt-safety.mjs
node scripts/check-youtube-draft-quality.mjs
```

Expected: PASS.

---

## Task 9: Persist Research Brief and Source Evidence

**Files:**
- Modify: `C:\Users\amd\hermes\automation\gemini-research-draft.mjs`
- Modify: `C:\Users\amd\hermes\youtube-workflow-stages.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-research-grounding-contract.mjs`
- Modify: `C:\Users\amd\hermes\package.json`

- [ ] **Step 1: Add a research grounding contract test**

Create `scripts/check-research-grounding-contract.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const geminiResearch = readFileSync(resolve(root, "automation/gemini-research-draft.mjs"), "utf8");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");

assert.match(geminiResearch, /research_brief|sourceEvidence|source_grounding/i, "Gemini/Gems prompt should include source grounding evidence");
assert.match(geminiResearch, /exact keyword|required keyword|missingTokens/i, "Keyword jobs should require the exact subject token");
assert.match(stages, /research_brief\.json|persistResearchBrief/i, "Workflow should persist research brief evidence for audit");

console.log(JSON.stringify({ ok: true, checked: "research-grounding-contract" }));
```

Run:

```powershell
node scripts/check-research-grounding-contract.mjs
```

Expected: FAIL until implementation is added.

- [ ] **Step 2: Persist `research_brief.json` for every job**

For keyword jobs:

```json
{
  "sourceType": "keyword",
  "sourceValue": "최신 gemini 소식",
  "requiredKeywordTokens": ["gemini"],
  "notes": ["Keyword jobs must keep required tokens in title or first narration sentence."]
}
```

For URL jobs:

```json
{
  "sourceType": "url",
  "sourceValue": "https://...",
  "provider": "gemini-gems-browser",
  "sourceEvidence": {
    "url": "https://...",
    "title": "if fetched",
    "notes": ["article transformed; no copy-paste allowed"]
  }
}
```

- [ ] **Step 3: Strengthen Gems compact prompt for keyword jobs**

In `buildGemsPrompt`, add:

```js
if (job.sourceType === "keyword") {
  lines.push(`Required keyword subject: ${job.sourceValue}`);
  lines.push("The title and first narration sentence must include the exact required keyword subject, excluding generic words like 최신, 뉴스, 소식.");
  lines.push("If the keyword asks for latest/current news, first research the current Gemini result page inside Gemini before drafting.");
}
```

- [ ] **Step 4: Add accepted-draft source grounding metadata**

When a draft is accepted, write source grounding into `provider-fallback-chain.json`:

```json
{
  "provider": "gemini-gems",
  "status": "accepted",
  "sourceGrounding": {
    "ok": true,
    "requiredKeywordTokens": ["gemini"],
    "titleContainsRequiredToken": true,
    "firstNarrationContainsRequiredToken": true
  }
}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
node scripts/check-research-grounding-contract.mjs
node scripts/check-provider-fallback-observability.mjs
npm.cmd run check
```

Expected: PASS.

---

## Task 10: Re-run Recent Failure Scenarios After Quality Fixes

**Files:**
- Use Hermes Studio UI and existing workflow scripts.

- [ ] **Step 1: Re-run keyword `최신 gemini 소식`**

Expected accepted draft:
- title includes `Gemini` or `제미나이`.
- first narration sentence includes `Gemini` or `제미나이`.
- no generic-only AI/data-center drift unless directly tied to Gemini news.
- HPSL object shape is valid.
- all Flow prompts are `9:16`, not `16:9`.

- [ ] **Step 2: Re-run the Naver URL in proper Longform mode**

Expected:
- `videoFormat: "longform"`.
- `researchProvider: "notebooklm-mcp"` unless explicitly overridden.
- `research_brief.json` exists.
- provider fallback chain is non-empty.

- [ ] **Step 3: Re-run a Shorts URL job**

Expected:
- target is 30/45/60/90 seconds only.
- article is rewritten, not copied.
- no source-irrelevant hallucinated claims.
- scene prompts visually reflect each narration sentence.

- [ ] **Step 4: Save QA summary**

For each successful job, persist `draft-qa-report.json`:

```json
{
  "sourceGrounding": "pass",
  "hpsl": "pass",
  "promptAspect": "pass",
  "scenePromptAlignment": "pass",
  "duration": "pass"
}
```

- [ ] **Step 5: Verify failure diagnostics after one intentional QA failure**

Run one intentional bad draft/prompt contract check and confirm the DB mirror keeps the reason searchable:

```powershell
node scripts/check-youtube-draft-quality.mjs
node scripts/check-desktop-progress-feedback.mjs
```

Expected:
- the failed QA object includes a `failureCode`.
- the mirrored DB failure payload includes the same `failureCode`.
- no zero-byte provider fallback file is produced.

---

## Task 11: Mirror Structured Failure Codes Into SQLite Diagnostics

**Files:**
- Modify: `C:\Users\amd\hermes\electron\services\workflow-db-events.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-desktop-progress-feedback.mjs`

- [ ] **Step 1: Add a regression assertion for failure-code mirroring**

In `scripts/check-desktop-progress-feedback.mjs`, extend the existing workflow DB mirror checks:

```js
assert.match(workflowDbEvents, /failureCodeOf/, "Workflow DB mirror should extract structured failure codes");
assert.match(workflowDbEvents, /SOURCE_GROUNDING_MISMATCH|FLOW_PROMPT_ASPECT_MISMATCH|HPSL_STRUCTURE_MISMATCH/, "Known draft QA failure codes should be preserved for diagnose views");
assert.match(workflowDbEvents, /\[.*failureCode.*\]|prefixFailureCode/, "task_failures.error_msg should include a searchable failure-code prefix");
```

Run:

```powershell
node scripts/check-desktop-progress-feedback.mjs
```

Expected: FAIL until failure-code extraction is implemented.

- [ ] **Step 2: Extract failure codes from workflow events**

In `electron/services/workflow-db-events.mjs`, add:

```js
function failureCodeOf(event = {}) {
  const directCode = event.details?.failureCode
    || event.details?.qa?.failureCode
    || event.details?.durationQa?.failureCode
    || event.details?.eventType
    || event.error?.code
    || "";
  if (directCode) return String(directCode);

  const text = [
    event.message,
    event.error?.message,
    event.details?.reason,
  ].filter(Boolean).join(" ");

  if (/SOURCE_GROUNDING_MISMATCH/i.test(text)) return "SOURCE_GROUNDING_MISMATCH";
  if (/FLOW_PROMPT_ASPECT_MISMATCH|16:9.*9:16|aspect/i.test(text)) return "FLOW_PROMPT_ASPECT_MISMATCH";
  if (/HPSL_STRUCTURE_MISMATCH|Expected HPSL/i.test(text)) return "HPSL_STRUCTURE_MISMATCH";
  if (/output mode mismatch|flow-mode-mismatch/i.test(text)) return "FLOW_MODE_MISMATCH";
  if (/duration.*too short/i.test(text)) return "DRAFT_DURATION_TOO_SHORT";
  if (/duration.*too long/i.test(text)) return "DRAFT_DURATION_TOO_LONG";
  return "";
}

function prefixFailureCode(code, payload) {
  return code ? `[${code}] ${payload}` : payload;
}
```

- [ ] **Step 3: Include `failureCode` in mirrored failure payloads without migrating the DB**

Where `workflow-db-events.mjs` serializes failure events, add the extracted code to the JSON payload and prefix the stored `error_msg`:

```js
const failureCode = failureCodeOf(event);
const failurePayload = {
  ...existingFailurePayload,
  failureCode,
};
const errorMsg = prefixFailureCode(failureCode, JSON.stringify(failurePayload));
await logFailure({
  taskName,
  chatId,
  messageId,
  errorMsg,
  recovered: 0,
});
```

If the code path already passes a string to the DB helper, preserve that API and only change the string content. Do not add a SQLite migration in this task.

- [ ] **Step 4: Verify diagnose-friendly failures**

Run:

```powershell
node scripts/check-desktop-progress-feedback.mjs
node scripts/check-desktop-failure-persistence.mjs
```

Expected:
- `SOURCE_GROUNDING_MISMATCH`, `FLOW_PROMPT_ASPECT_MISMATCH`, `HPSL_STRUCTURE_MISMATCH`, and `FLOW_MODE_MISMATCH` appear in mirrored failure payloads.
- Existing DB tables still work without schema changes.

---

## Acceptance Criteria

- Flow hybrid/video scene 1 can switch from current Nano Banana Pro image mode to video mode.
- Shorts cannot submit a 600s+ custom duration.
- Longform selection reliably submits `videoFormat: "longform"` and enables longform defaults.
- Provider fallback logs are never left as a zero-byte JSON file.
- Pre-draft failures always include `job-request.json` and `desktop-failure.json`.
- Accepted drafts must be source-grounded: keyword subjects appear in the title/first narration and URL jobs transform article ideas without copying.
- HPSL drafts with malformed `structure` or string-only `hpsl` sections are rejected before Flow generation.
- Flow prompts for Shorts/vertical jobs must be `9:16`; `16:9` prompts are rejected or normalized before Flow.
- Each accepted job persists a `research_brief.json` or equivalent source evidence record.
- `/diagnose` and SQLite `task_failures.error_msg` can group known failures by structured code without requiring a DB schema migration.
- Console error messages explain what failed and what recovery action is available.
- The packaged desktop app includes these fixes and the desktop shortcut launches the updated app.
