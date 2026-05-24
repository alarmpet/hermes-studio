# Unified Hermes And Electron YouTube Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hermes Telegram YouTube automation and Electron YouTube Studio must use one shared production engine so the workflow is always `input keyword/url -> research/draft -> scene prompts -> Google Flow media -> TTS/subtitle/final render -> optional upload`, regardless of whether the user starts it from Telegram or the Electron app.

**Architecture:** Keep `youtube-job-runner.mjs` as the single orchestration entrypoint, move proven draft/media/render behavior into shared stage adapters, and make Telegram/Electron only thin UI adapters. The existing Telegram/Hermes path already contains working behavior for script creation, Flow generation, retry, final-only delivery, and render handoff; Electron must reuse that shared engine instead of keeping a separate draft/Flow path that drifts.

**Tech Stack:** Node.js ESM, Electron IPC, Playwright/Chrome persistent profiles, Google Gemini browser session, Google Flow browser automation, OpenRouter fallback, Supertonic local TTS, ffmpeg, YouTube Data API upload, existing Telegram bot adapter.

---

## Verified Root Cause

The user is right to question the split. The repo currently has a partial shared runner, but the real behavior is not fully shared.

Confirmed files:

- `C:\Users\amd\hermes\youtube-job-runner.mjs`
  - Shared orchestration exists.
  - It calls `generateYouTubeWorkflowAssets` and `renderFinalYouTubeVideo`.
- `C:\Users\amd\hermes\youtube-workflow.mjs`
  - Shared normalization, scene planning, render handoff, and fallback draft helpers exist.
- `C:\Users\amd\hermes\telegram-flow-news-bot.mjs`
  - Telegram/Hermes still contains a large amount of inline working behavior:
    - YouTube command routing.
    - Draft prompt behavior.
    - Google Flow scene generation and retry logic.
    - Final-only video delivery behavior.
- `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`
  - Electron calls the shared runner, but injects its own stage behavior.
  - It uses `electron/services/youtube-draft-service.mjs` for draft generation.
  - It uses `automation/google-flow-media.mjs` for Flow.
- `C:\Users\amd\hermes\electron\services\youtube-draft-service.mjs`
  - Electron draft generation currently uses OpenRouter directly.
  - It does not run Gemini browser research first.
- `C:\Users\amd\hermes\automation\google-flow-media.mjs`
  - Electron Flow automation is separate from the older Telegram inline Flow automation.
  - It can click the Flow create button and then wait for a new video URL, but it does not currently prove that generation actually started.

Observed failure pattern:

- Electron UI reaches `Google Flow 영상 생성` almost immediately.
- Latest desktop job folder contains draft/request/render-option files and Flow screenshots.
- It does not contain `scene_1_flow.mp4`, `metadata.json`, or a final rendered video.
- Flow screenshot shows the prompt still sitting in the input area and the create arrow still visible, which means the automation may have clicked without successfully starting generation.

Conclusion:

- Hermes Telegram and Electron are not yet managed as one product pipeline.
- Electron was given its own draft service and Flow automation path.
- That is why the old Hermes path can work while Electron gets stuck at Flow.
- The fix is not another one-off patch in Electron. The fix is to promote the working Hermes behavior into shared modules and force both entrypoints to use them.

---

## Review Incorporation From `HERMES_GEMINI_RESEARCH_FLOW_REVIEW.md`

The review document was checked against the current repository before changing this plan.

Accepted findings:

- Gemini JSON streaming race is valid. The first plan returned text as soon as a broad `/{... "scenes" ...}/` regex matched. Gemini streams responses, so this can capture incomplete JSON and incorrectly fall back to OpenRouter. The plan now requires parsing the candidate JSON inside the wait loop and returning only after it parses.
- Telegram variable mapping risk is valid. The previous plan used names such as `FLOW_PROFILE_DIR`, `GEMINI_PROFILE_DIR`, `CHROME_PATH`, and `FFMPEG_BIN`, but the current Telegram bot actually has `PROFILE_DIR` and `findBrowser()`, and does not define those new names. The plan now explicitly introduces a small Telegram runtime context builder instead of assuming undefined constants.
- Mock media migration is valid. The shared stage module must support `job.options.mockMediaMode`, otherwise fast smoke tests will accidentally open Playwright/Flow and fail or consume quota.
- SQLite event logging is valid as a diagnostics improvement. `bot_db_helper.py` already has `log-event` and `upsert-job`; shared workflow events should be mirrored there so Telegram and Electron jobs can be diagnosed through the same DB.

Not accepted as a first-pass implementation requirement:

- Switching Gemini/Flow browser automation to `headless: true` is not adopted as a default or required feature. Google login and Flow/Gemini UI automation are more reliable in visible persistent Chrome profiles. A later advanced setting may pass a `headless` option through the context, but this plan keeps `headless: false` for the production path.

---

## Target Product Rule

There must be only one YouTube production engine.

Allowed entrypoints:

- Telegram command.
- Electron app button.
- Future CLI or scheduler.

Shared engine responsibilities:

- Input normalization.
- Keyword or URL source research.
- Draft/script generation.
- Scene planning.
- Stable character profile enforcement.
- Flow prompt creation.
- Google Flow media generation and download.
- TTS generation.
- Subtitle generation.
- Final render.
- Thumbnail generation.
- Optional YouTube upload.
- Progress/failure events.

Entrypoint responsibilities only:

- Collect user input.
- Show progress.
- Ask for authentication.
- Display or send final output.
- Convert engine events into UI-specific messages.

---

## File Structure

- Modify: `C:\Users\amd\hermes\youtube-job-runner.mjs`
  - Keep as the single production runner.
  - Add stricter stage names and event contracts.

- Modify: `C:\Users\amd\hermes\youtube-workflow.mjs`
  - Keep shared schema normalization and render handoff.
  - Remove UI-specific assumptions.
  - Export shared draft, scene, and prompt helpers used by both Telegram and Electron.

- Create: `C:\Users\amd\hermes\youtube-workflow-stages.mjs`
  - New canonical stage adapter module.
  - Owns `buildResearchDraft`, `generateSceneMedia`, `renderFinalVideo`, `generateThumbnail`, and optional `uploadFinalVideo`.
  - Owns shared `generateMockMedia` so Electron and tests do not keep their own mock pipeline.

- Create: `C:\Users\amd\hermes\automation\gemini-research-draft.mjs`
  - Browser-based Gemini research/draft adapter.
  - Uses the authenticated Gemini profile.
  - Produces structured draft JSON.
  - Saves request/response artifacts per job.

- Modify: `C:\Users\amd\hermes\automation\google-flow-media.mjs`
  - Becomes the one canonical Google Flow automation module.
  - Incorporates the working Hermes/Telegram retry and failure handling behavior.
  - Adds submit-start verification before waiting for media URL.

- Modify: `C:\Users\amd\hermes\telegram-flow-news-bot.mjs`
  - Remove or bypass inline YouTube Flow generation logic.
  - Convert Telegram into an adapter around `runYouTubeJob` plus shared stages.
  - Keep Telegram-only message formatting and final video sending.
  - Add a runtime context builder that maps current bot constants/functions to shared stage config.

- Modify: `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`
  - Remove Electron-only draft and media decisions.
  - Call the same shared stages used by Telegram.
  - Keep Electron-only IPC/progress mapping.

- Modify: `C:\Users\amd\hermes\electron\services\youtube-draft-service.mjs`
  - Demote to OpenRouter fallback only, or move fallback logic into `youtube-workflow-stages.mjs`.
  - Electron must not call this as the primary draft path.

- Modify: `C:\Users\amd\hermes\electron\services\job-progress-events.mjs`
  - Replace broken/mojibake Korean labels.
  - Add real phases for research, draft, scene planning, Flow submit, Flow wait, download, TTS, render, thumbnail, upload.

- Modify: `C:\Users\amd\hermes\electron\renderer\app.js`
  - Render granular progress from shared engine events.
  - Show current scene number and exact wait reason.

- Modify: `C:\Users\amd\hermes\scripts\check-youtube-job-runner.mjs`
  - Verify Telegram and Electron both route through the same shared stages.

- Create: `C:\Users\amd\hermes\scripts\check-unified-youtube-workflow.mjs`
  - Static contract test proving no duplicate primary draft/Flow path exists.

- Create: `C:\Users\amd\hermes\scripts\smoke-electron-youtube-mock-job.mjs`
  - Runs Electron-compatible job context with mock media.
  - Proves progress ordering without spending Google Flow quota.

- Create: `C:\Users\amd\hermes\workflow-db-events.mjs`
  - Small shared helper that mirrors workflow events into `bot_data.db` through `bot_db_helper.py`.
  - Used by both Telegram and Electron contexts.

- Modify: `C:\Users\amd\hermes\package.json`
  - Include new shared workflow files in the Electron package build.
  - Add unified workflow checks.

---

### Task 1: Define The Shared Stage Contract

**Files:**
- Modify: `C:\Users\amd\hermes\youtube-job-runner.mjs`
- Create: `C:\Users\amd\hermes\youtube-workflow-stages.mjs`
- Test: `C:\Users\amd\hermes\scripts\check-unified-youtube-workflow.mjs`

- [ ] **Step 1: Write the contract test**

Create `C:\Users\amd\hermes\scripts\check-unified-youtube-workflow.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const stages = await import("../youtube-workflow-stages.mjs");
const runnerSource = readFileSync(resolve(root, "youtube-job-runner.mjs"), "utf8");
const electronService = readFileSync(resolve(root, "electron/services/youtube-job-service.mjs"), "utf8");
const telegramBot = readFileSync(resolve(root, "telegram-flow-news-bot.mjs"), "utf8");

for (const name of [
  "buildResearchDraft",
  "generateSceneMedia",
  "renderFinalVideo",
  "generateThumbnail",
]) {
  assert.equal(typeof stages[name], "function", `${name} must be exported by shared stages`);
}

assert.match(runnerSource, /runYouTubeJob/, "shared runner must remain the production entrypoint");
assert.match(electronService, /createDefaultYouTubeStages/, "Electron must use shared stage factory");
assert.match(telegramBot, /createDefaultYouTubeStages/, "Telegram must use shared stage factory");
assert.doesNotMatch(electronService, /buildDesktopYouTubeDraft\(/, "Electron must not call its old primary OpenRouter draft service directly");

console.log(JSON.stringify({ ok: true, checked: "unified-youtube-workflow" }));
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node scripts/check-unified-youtube-workflow.mjs
```

Expected:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module ... youtube-workflow-stages.mjs
```

- [ ] **Step 3: Create shared stage module**

Create `C:\Users\amd\hermes\youtube-workflow-stages.mjs`:

```js
import { spawnSync } from "node:child_process";
import { generateYouTubeWorkflowAssets, renderFinalYouTubeVideo } from "./youtube-workflow.mjs";
import { buildGeminiResearchDraft } from "./automation/gemini-research-draft.mjs";
import { generateGoogleFlowVideoFromPrompt } from "./automation/google-flow-media.mjs";
import { createThumbnailForJob } from "./pipeline/youtube-thumbnail.mjs";
import { join } from "node:path";

export function createDefaultYouTubeStages(context = {}) {
  return {
    generateYouTubeWorkflowAssets,
    renderFinalYouTubeVideo: (job, assets, runnerContext) => renderFinalVideo(job, assets, { ...context, ...runnerContext }),
    buildDraft: (job, runnerContext) => buildResearchDraft(job, { ...context, ...runnerContext }),
    generateSceneMedia: (args) => generateSceneMedia(args, context),
    generateThumbnail: (result) => generateThumbnail(result, context),
  };
}

export async function buildResearchDraft(job, context = {}) {
  return buildGeminiResearchDraft(job, context);
}

export async function generateSceneMedia({ scene, jobDir }, context = {}) {
  if (context.job?.options?.mockMediaMode || context.mockMediaMode) {
    return generateMockMedia({ scene, jobDir }, context);
  }

  const prompt = scene.image_prompt;
  const media = await generateGoogleFlowVideoFromPrompt({
    prompt,
    jobDir,
    sceneOrder: scene.order,
    chromePath: context.chromePath,
    profileDir: context.paths?.flowProfileDir,
    timeoutMs: context.flowTimeoutMs,
    onProgress: context.onFlowProgress,
  });
  return { path: media.path, bytes: media.bytes, contentType: media.contentType };
}

export async function generateMockMedia({ scene, jobDir }, context = {}) {
  const ffmpegBin = context.ffmpegBin;
  if (!ffmpegBin) throw new Error("ffmpegBin is required for Mock Media Mode.");
  const outputPath = join(jobDir, `scene_${scene.order}.mp4`);
  const colors = ["0f766e", "334155", "7c2d12", "4338ca", "166534", "9f1239"];
  const color = colors[(Number(scene.order || 1) - 1) % colors.length];
  const duration = Math.max(4, Number(scene.duration_seconds || 8));
  const result = spawnSync(ffmpegBin, [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=0x${color}:s=720x1280:d=${duration}:r=30`,
    "-vf", "drawbox=x=54:y=96:w=612:h=260:color=black@0.28:t=fill",
    "-an",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "veryfast",
    "-crf", "22",
    outputPath,
  ], {
    cwd: context.paths?.appRoot || process.cwd(),
    encoding: "utf8",
    maxBuffer: 40 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Mock video generation failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return { path: outputPath };
}

export async function renderFinalVideo(job, assets, context = {}) {
  return renderFinalYouTubeVideo(job, assets, context);
}

export async function generateThumbnail(result, context = {}) {
  return createThumbnailForJob({
    draft: result.assets?.draft,
    paths: context.paths,
    jobDir: result.assets?.jobDir,
  });
}
```

- [ ] **Step 4: Run syntax check**

Run:

```bash
node --check youtube-workflow-stages.mjs
```

Expected:

```text
```

No output and exit code `0`.

---

### Task 2: Add Gemini Research As The Primary Draft Source

**Files:**
- Create: `C:\Users\amd\hermes\automation\gemini-research-draft.mjs`
- Modify: `C:\Users\amd\hermes\youtube-workflow-stages.mjs`
- Test: `C:\Users\amd\hermes\scripts\check-unified-youtube-workflow.mjs`

- [ ] **Step 1: Create Gemini draft adapter**

Create `C:\Users\amd\hermes\automation\gemini-research-draft.mjs`:

```js
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { normalizeYouTubeDraft, parseJsonMarkdown } from "../youtube-workflow.mjs";
import { buildDesktopYouTubeDraft } from "../electron/services/youtube-draft-service.mjs";

export const GEMINI_URL = "https://gemini.google.com/";

export async function buildGeminiResearchDraft(job, context = {}) {
  const jobDir = context.jobDir;
  if (!jobDir) throw new Error("jobDir is required for Gemini research draft.");
  await mkdir(jobDir, { recursive: true });

  try {
    const draft = await requestGeminiDraft(job, context);
    return normalizeYouTubeDraft(draft);
  } catch (error) {
    if (context.allowOpenRouterFallback === false) throw error;
    context.emit?.({
      type: "workflow-warning",
      phase: "research-draft",
      message: `Gemini draft failed; using OpenRouter fallback. ${error.message}`,
    });
    return buildDesktopYouTubeDraft(job, context);
  }
}

async function requestGeminiDraft(job, context = {}) {
  const chromePath = context.chromePath;
  const profileDir = context.paths?.geminiProfileDir;
  const jobDir = context.jobDir;
  if (!chromePath) throw new Error("Chrome executable is required for Gemini research.");
  if (!profileDir) throw new Error("Gemini profile directory is required.");

  const prompt = buildGeminiPrompt(job);
  await writeFile(join(jobDir, "gemini-request.txt"), prompt, "utf8");

  const browser = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: false,
    acceptDownloads: true,
    args: ["--no-first-run", "--no-default-browser-check"],
  });

  try {
    const page = browser.pages()[0] || await browser.newPage();
    page.setDefaultTimeout(60000);
    await page.goto(GEMINI_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await assertGeminiReady(page);
    await submitPrompt(page, prompt);
    const response = await waitForJsonResponse(page);
    await writeFile(join(jobDir, "gemini-response.txt"), response, "utf8");
    const parsed = parseJsonMarkdown(response);
    if (!parsed) throw new Error("Gemini returned invalid JSON.");
    return parsed;
  } finally {
    await browser.close().catch(() => {});
  }
}

function buildGeminiPrompt(job) {
  const sourceLabel = job.sourceType === "url" ? "URL" : "keyword";
  return [
    "You are Hermes YouTube Shorts research and production planner.",
    "Research the user's source inside Gemini when useful, then produce one valid JSON object only.",
    "Do not include markdown.",
    "Schema:",
    "{\"title\":\"string\",\"character_profile\":\"English stable character profile\",\"duration_seconds\":90,\"script\":\"Korean narration\",\"scenes\":[{\"order\":1,\"narration\":\"Korean sentence\",\"image_prompt\":\"English Google Flow 9:16 video prompt\",\"duration_seconds\":8}]}",
    "Rules:",
    "- The Korean script must match the requested topic exactly.",
    "- For keyword jobs, mention the exact keyword in the title and first narration sentence.",
    "- For URL jobs, rewrite and transform the article idea instead of copying.",
    "- Each scene prompt must reflect the corresponding narration sentence.",
    "- If a character appears, keep one consistent age, gender, ethnicity, face, hairstyle, outfit, and role across every scene.",
    "- Prompts must avoid logos, subtitles, readable text, captions, and watermarks.",
    `${sourceLabel}: ${job.sourceValue}`,
  ].join("\n");
}

async function assertGeminiReady(page) {
  const state = await page.evaluate(() => ({
    href: location.href,
    text: document.body?.innerText?.slice(0, 1200) || "",
  }));
  if (/accounts\.google|signin|login/i.test(`${state.href} ${state.text}`)) {
    throw new Error("Gemini login is required. Use Authenticate Gemini and run again.");
  }
}

async function submitPrompt(page, prompt) {
  const textbox = page.locator("[contenteditable='true'], textarea").last();
  await textbox.click();
  await page.keyboard.insertText(prompt);
  await page.keyboard.press("Enter");
}

async function waitForJsonResponse(page) {
  const deadline = Date.now() + 180000;
  let lastText = "";
  let lastGoodCandidate = "";
  let stableCount = 0;
  while (Date.now() < deadline) {
    await page.waitForTimeout(3000);
    lastText = await page.evaluate(() => document.body?.innerText || "");
    const candidates = Array.from(lastText.matchAll(/\{[\s\S]*?"scenes"[\s\S]*?\}/g))
      .map((match) => match[0])
      .reverse();
    for (const candidate of candidates) {
      const parsed = parseJsonMarkdown(candidate);
      if (!parsed || !Array.isArray(parsed.scenes)) continue;
      if (candidate === lastGoodCandidate) {
        stableCount += 1;
      } else {
        lastGoodCandidate = candidate;
        stableCount = 1;
      }
      if (stableCount >= 2) return candidate;
    }
  }
  throw new Error(`Gemini JSON response was not detected. Last text: ${lastText.slice(-500)}`);
}
```

The parser deliberately waits for a parseable candidate twice. This prevents returning a partial Gemini streaming response just because the word `"scenes"` appeared before the JSON object finished.

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check automation/gemini-research-draft.mjs
```

Expected:

```text
```

No output and exit code `0`.

---

### Task 3: Make Electron Use The Shared Stages

**Files:**
- Modify: `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`
- Test: `C:\Users\amd\hermes\scripts\check-unified-youtube-workflow.mjs`

- [ ] **Step 1: Replace Electron-only stage wiring**

In `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`, replace direct imports of `generateYouTubeWorkflowAssets`, `renderFinalYouTubeVideo`, `generateGoogleFlowVideoFromPrompt`, and `buildDesktopYouTubeDraft` with:

```js
import { createDefaultYouTubeStages } from "../../youtube-workflow-stages.mjs";
```

Then build stages inside `createYouTubeJob`:

```js
const stages = createDefaultYouTubeStages({
  ...context,
  paths: context.paths,
  chromePath: context.chromePath || findChromeExecutable(),
  ffmpegBin: context.ffmpegBin,
  onFlowProgress: ({ message, details }) => emitJobProgress(context.emit, {
    jobId: job.id,
    phase: "flow-media",
    message,
    details,
  }),
});
```

Pass these stages to `runYouTubeJob`:

```js
const result = await runYouTubeJob(job, {
  ...context,
  ...stages,
  job,
  jobDir,
  finalName: `desktop-${job.options.mockMediaMode ? "mock" : "flow"}-${Date.now()}.mp4`,
});
```

- [ ] **Step 2: Preserve Electron progress events**

Keep `emitJobProgress` calls, but remove duplicated draft/Flow implementations. Electron can wrap stage events, but it must not own the production logic.

- [ ] **Step 3: Run the contract test**

Run:

```bash
node scripts/check-unified-youtube-workflow.mjs
```

Expected after Telegram task is still pending:

```text
AssertionError: Telegram must use shared stage factory
```

This failure is expected until Task 4 is done.

---

### Task 4: Make Telegram Use The Same Shared Stages

**Files:**
- Modify: `C:\Users\amd\hermes\telegram-flow-news-bot.mjs`
- Test: `C:\Users\amd\hermes\scripts\check-youtube-job-runner.mjs`
- Test: `C:\Users\amd\hermes\scripts\check-unified-youtube-workflow.mjs`

- [ ] **Step 1: Import shared stage factory**

Add:

```js
import { createDefaultYouTubeStages } from "./youtube-workflow-stages.mjs";
import ffmpegPath from "ffmpeg-static";
```

- [ ] **Step 2: Add Telegram runtime context builder**

Add this helper near the existing `findBrowser()` function or near the YouTube workflow helpers:

```js
const GEMINI_PROFILE_DIR = `${ROOT}/.gemini-browser-profile`;

function buildTelegramYouTubeStageContext({ chatId, replyToMessageId } = {}) {
  return {
    paths: {
      appRoot: ROOT,
      runtimeRoot: ROOT,
      outputDir: OUTPUT_DIR,
      flowProfileDir: PROFILE_DIR,
      geminiProfileDir: GEMINI_PROFILE_DIR,
    },
    chromePath: findBrowser(),
    ffmpegBin: ffmpegPath,
    emit: (event) => {
      if (event.type === "workflow-warning") {
        sendText(chatId, `주의: ${event.message}`, replyToMessageId).catch(() => {});
      }
    },
    onFlowProgress: ({ message }) => {
      if (!message) return;
      sendTypingOrProgress(chatId, message).catch(() => {});
    },
  };
}
```

Do not use undefined names such as `FLOW_PROFILE_DIR`, `CHROME_PATH`, or `FFMPEG_BIN`. The current bot already has `PROFILE_DIR` for Flow and `findBrowser()` for browser discovery.

- [ ] **Step 3: Replace inline YouTube stage injection**

In the function that currently calls `runYouTubeJob(jobRequest, { ... })`, replace inline `generateSceneMedia` and `renderFinalVideo` stage definitions with:

```js
const stages = createDefaultYouTubeStages(buildTelegramYouTubeStageContext({ chatId, replyToMessageId }));

await runYouTubeJob(jobRequest, {
  ...stages,
  emit: telegramWorkflowEventEmitter,
});
```

- [ ] **Step 4: Keep Telegram final delivery behavior**

Keep the existing behavior that sends only the final rendered video to Telegram. Do not reintroduce scene-by-scene video sending.

- [ ] **Step 5: Run Telegram workflow contract**

Run:

```bash
node scripts/check-youtube-job-runner.mjs
```

Expected:

```json
{"ok":true,"checked":"youtube-job-runner"}
```

- [ ] **Step 6: Run unified workflow contract**

Run:

```bash
node scripts/check-unified-youtube-workflow.mjs
```

Expected:

```json
{"ok":true,"checked":"unified-youtube-workflow"}
```

---

### Task 5: Harden Google Flow Start Verification

**Files:**
- Modify: `C:\Users\amd\hermes\automation\google-flow-media.mjs`
- Test: `C:\Users\amd\hermes\scripts\check-unified-youtube-workflow.mjs`

- [ ] **Step 1: Add submit state probe**

Add a function in `automation/google-flow-media.mjs`:

```js
async function probeFlowSubmitState(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || "";
    const textboxes = Array.from(document.querySelectorAll("[contenteditable='true'], textarea"))
      .map((el) => ({
        text: (el.innerText || el.value || el.textContent || "").trim(),
        rect: el.getBoundingClientRect(),
      }))
      .filter((item) => item.rect.width > 100 && item.rect.height > 10);
    const buttons = Array.from(document.querySelectorAll("button,[role='button']"))
      .map((el) => ({
        text: [el.innerText, el.textContent, el.getAttribute("aria-label"), el.getAttribute("title")]
          .filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
        disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
        rect: el.getBoundingClientRect(),
      }))
      .filter((item) => item.rect.width > 10 && item.rect.height > 10);
    const percents = Array.from(text.matchAll(/(\d+)%/g)).map((match) => Number(match[1]));
    return {
      promptStillVisible: textboxes.some((item) => item.text.length > 20),
      createButtonVisible: buttons.some((item) => /arrow_forward|create|generate|만들기|생성/i.test(item.text) && !item.disabled),
      hasProgressPercent: percents.length > 0,
      maxPercent: percents.length ? Math.max(...percents) : null,
      hasVideo: document.querySelectorAll("video").length > 0,
      textTail: text.slice(-1000),
    };
  });
}
```

- [ ] **Step 2: Verify generation starts after click**

Immediately after clicking the Flow create button, wait up to 20 seconds for one of these states:

- prompt input clears,
- create button becomes disabled/loading,
- progress percent appears,
- a media card/video placeholder appears.

Use:

```js
async function verifyFlowSubmissionStarted(page, jobDir, sceneOrder) {
  let lastState = null;
  for (let i = 0; i < 20; i += 1) {
    await delay(1000);
    lastState = await probeFlowSubmitState(page);
    if (!lastState.promptStillVisible || !lastState.createButtonVisible || lastState.hasProgressPercent || lastState.hasVideo) {
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_submit_state.json`), JSON.stringify({
        ok: true,
        state: lastState,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
      return lastState;
    }
  }

  const screenshotPath = join(jobDir, `scene_${sceneOrder}_flow_submit_failed.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  await writeFile(join(jobDir, `scene_${sceneOrder}_flow_submit_state.json`), JSON.stringify({
    ok: false,
    reason: "flow-submit-did-not-start",
    state: lastState,
    screenshotPath,
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
  throw new Error(`Google Flow did not start generation after clicking create. Screenshot: ${screenshotPath}`);
}
```

- [ ] **Step 3: Call the verifier**

Call it after:

```js
await page.mouse.click(positions.create.x, positions.create.y);
```

Expected behavior:

- If Flow does not start, the job fails immediately with a useful screenshot.
- The app no longer waits ten minutes pretending media generation is underway.

---

### Task 6: Repair Progress UX For Both Entrypoints

**Files:**
- Modify: `C:\Users\amd\hermes\electron\services\job-progress-events.mjs`
- Modify: `C:\Users\amd\hermes\electron\renderer\app.js`
- Modify: `C:\Users\amd\hermes\telegram-flow-news-bot.mjs`

- [ ] **Step 1: Replace progress phase list**

Use this phase list in `job-progress-events.mjs`:

```js
export const JOB_PROGRESS_PHASES = [
  { id: "submitted", label: "작업 접수", percent: 5, message: "작업을 접수했습니다." },
  { id: "research", label: "Gemini 자료 수집", percent: 12, message: "Gemini에서 키워드 또는 URL 자료를 확인하는 중입니다." },
  { id: "draft", label: "대본 생성", percent: 24, message: "대본과 장면 구성을 생성하는 중입니다." },
  { id: "scene-planning", label: "장면 구성", percent: 34, message: "대본 문장에 맞춰 장면과 Flow 프롬프트를 구성하는 중입니다." },
  { id: "flow-submit", label: "Flow 생성 요청", percent: 45, message: "Google Flow에 장면 생성 요청을 넣는 중입니다." },
  { id: "flow-media", label: "Flow 영상 생성", percent: 62, message: "Google Flow에서 장면 영상을 생성하고 다운로드하는 중입니다." },
  { id: "render", label: "TTS/자막/최종 렌더", percent: 82, message: "음성, 자막, 최종 영상을 렌더링하는 중입니다." },
  { id: "thumbnail", label: "썸네일 생성", percent: 92, message: "제목과 대본 맥락을 반영해 썸네일을 생성하는 중입니다." },
  { id: "upload", label: "유튜브 업로드", percent: 96, message: "승인된 영상을 YouTube에 업로드하는 중입니다." },
  { id: "completed", label: "완료", percent: 100, message: "최종 영상 생성이 완료되었습니다." },
];
```

- [ ] **Step 2: Map shared events to Electron UI**

In `electron/renderer/app.js`, ensure unknown engine events are shown in the console panel and current step text. Do not silently drop events.

- [ ] **Step 3: Map shared events to Telegram**

In `telegram-flow-news-bot.mjs`, convert engine events into concise Telegram updates:

```text
Gemini 자료 수집 중...
대본 생성 완료: 장면 5개
Flow 장면 1/5 생성 요청...
Flow 장면 1/5 다운로드 완료
최종 렌더 중...
최종 영상 생성 완료
```

---

### Task 7: Add Mock Smoke Test For Fast Regression Checks

**Files:**
- Create: `C:\Users\amd\hermes\scripts\smoke-electron-youtube-mock-job.mjs`
- Modify: `C:\Users\amd\hermes\package.json`

- [ ] **Step 1: Create mock smoke script**

Create `C:\Users\amd\hermes\scripts\smoke-electron-youtube-mock-job.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createYouTubeJob } from "../electron/services/youtube-job-service.mjs";

const jobDir = await mkdtemp(join(tmpdir(), "hermes-youtube-smoke-"));
const events = [];

const result = await createYouTubeJob({
  sourceType: "keyword",
  sourceValue: "구글 글래스",
  scriptLengthMode: "preset",
  scriptLengthPreset: "micro",
  voiceId: "male_30_announcer",
  subtitleStyleId: "bold-shorts",
  mockMediaMode: true,
}, {
  outputDir: jobDir,
  ffmpegBin: ffmpegPath,
  emit: (event) => events.push(event),
  paths: {
    appRoot: process.cwd(),
    runtimeRoot: process.cwd(),
    outputDir: jobDir,
    flowProfileDir: join(jobDir, "flow-profile"),
    geminiProfileDir: join(jobDir, "gemini-profile"),
  },
  chromePath: "mock",
  allowOpenRouterFallback: true,
});

assert.ok(result.finalVideo?.finalPath, "mock job should render a final video");
assert.ok(events.some((event) => event.phase === "draft"), "draft phase should be emitted");
assert.ok(events.some((event) => event.phase === "render"), "render phase should be emitted");
assert.ok(events.some((event) => event.phase === "completed"), "completed phase should be emitted");

console.log(JSON.stringify({ ok: true, finalPath: result.finalVideo.finalPath, events: events.length }));
```

- [ ] **Step 2: Add npm script**

In `package.json`, add:

```json
"check:youtube-unified": "node scripts/check-unified-youtube-workflow.mjs && node scripts/check-youtube-job-runner.mjs && node scripts/smoke-electron-youtube-mock-job.mjs"
```

- [ ] **Step 3: Run smoke check**

Run:

```bash
npm run check:youtube-unified
```

Expected:

```json
{"ok":true,"checked":"unified-youtube-workflow"}
{"ok":true,"checked":"youtube-job-runner"}
{"ok":true,"finalPath":"...","events":...}
```

---

### Task 8: Mirror Shared Workflow Events To SQLite

**Files:**
- Create: `C:\Users\amd\hermes\workflow-db-events.mjs`
- Modify: `C:\Users\amd\hermes\electron\main.mjs`
- Modify: `C:\Users\amd\hermes\telegram-flow-news-bot.mjs`
- Modify: `C:\Users\amd\hermes\package.json`
- Test: `C:\Users\amd\hermes\scripts\check-unified-youtube-workflow.mjs`

- [ ] **Step 1: Create DB event helper**

Create `C:\Users\amd\hermes\workflow-db-events.mjs`:

```js
import { spawnSync } from "node:child_process";

export function mirrorWorkflowEventToDb(event = {}, context = {}) {
  const dbHelper = context.dbHelper || "C:/Users/amd/hermes/bot_db_helper.py";
  const pythonBin = context.pythonBin || "python";
  const jobId = event.jobId || context.jobId || "";
  const taskName = event.taskName || context.taskName || "youtube-workflow";
  const chatId = String(context.chatId || event.chatId || "desktop");
  const messageId = String(context.messageId || event.messageId || "0");
  const eventType = event.type || event.phase || "workflow-event";
  const payload = JSON.stringify({
    phase: event.phase || "",
    status: event.status || "",
    message: event.message || "",
    details: event.details || {},
    updatedAt: event.updatedAt || new Date().toISOString(),
  });

  const result = spawnSync(pythonBin, [
    dbHelper,
    "log-event",
    eventType,
    taskName,
    chatId,
    messageId,
    payload,
    "--job-id",
    jobId,
  ], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
```

- [ ] **Step 2: Use helper in Electron event bridge**

In `C:\Users\amd\hermes\electron\main.mjs`, import:

```js
import { mirrorWorkflowEventToDb } from "../workflow-db-events.mjs";
```

Then update `sendJobEvent(event)`:

```js
function sendJobEvent(event) {
  mirrorWorkflowEventToDb(event, {
    dbHelper: join(paths.appRoot, "bot_db_helper.py"),
    chatId: "desktop",
    messageId: "0",
    taskName: "youtube-workflow",
  });
  jobEvents.emit("event", event);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("youtube:event", event);
}
```

- [ ] **Step 3: Use helper in Telegram event bridge**

In `C:\Users\amd\hermes\telegram-flow-news-bot.mjs`, import:

```js
import { mirrorWorkflowEventToDb } from "./workflow-db-events.mjs";
```

Inside the Telegram YouTube workflow event emitter, call:

```js
mirrorWorkflowEventToDb(event, {
  dbHelper: DB_HELPER,
  chatId,
  messageId: replyToMessageId,
  taskName: "youtube-workflow",
});
```

- [ ] **Step 4: Extend contract test**

In `C:\Users\amd\hermes\package.json`, add the new shared file to `build.files`:

```json
"workflow-db-events.mjs",
"youtube-workflow-stages.mjs",
```

- [ ] **Step 5: Extend contract test**

In `C:\Users\amd\hermes\scripts\check-unified-youtube-workflow.mjs`, add:

```js
const dbEvents = await import("../workflow-db-events.mjs");
assert.equal(typeof dbEvents.mirrorWorkflowEventToDb, "function", "workflow DB event helper must be exported");
```

- [ ] **Step 6: Run DB helper smoke**

Run:

```bash
python bot_db_helper.py log-event smoke youtube-workflow desktop 0 "{\"message\":\"unified workflow smoke\"}" --job-id smoke-job
python bot_db_helper.py get-recent-events 1 desktop 0 --job-id smoke-job
```

Expected:

```text
[
  {
    "event_type": "smoke",
    "task_name": "youtube-workflow",
    ...
  }
]
```

---

### Task 9: Manual Real Flow Verification

**Files:**
- No source file changes.
- Uses packaged or dev Electron app.

- [ ] **Step 1: Start Electron app**

Run:

```bash
npm run electron
```

Expected:

```text
Hermes YouTube Studio opens.
```

- [ ] **Step 2: Authenticate required browsers**

In the app, click:

```text
Authenticate Gemini
Authenticate Google Flow
```

Expected:

```text
Both profiles remain logged in after the browser windows are closed.
```

- [ ] **Step 3: Run a real keyword job**

Input:

```text
구글 글래스
```

Click:

```text
Generate Final Video
```

Expected visible progress order:

```text
작업 접수
Gemini 자료 수집
대본 생성
장면 구성
Flow 생성 요청
Flow 영상 생성
TTS/자막/최종 렌더
썸네일 생성
완료
```

- [ ] **Step 4: Verify artifacts**

Check latest job folder under:

```text
C:\Users\amd\AppData\Roaming\hermes\outputs\desktop
```

Expected files:

```text
gemini-request.txt
gemini-response.txt
draft.json
render-options.json
scene_1_flow_submit_state.json
scene_1_flow.mp4
metadata.json
desktop-flow-*.mp4
```

- [ ] **Step 5: Verify failure behavior**

If Google Flow does not start generation, expected files:

```text
scene_1_flow_submit_failed.png
scene_1_flow_submit_state.json
```

Expected UI message:

```text
Google Flow did not start generation after clicking create.
```

This is a correct failure because it identifies the real blocking point instead of hanging at 56%.

---

## Rollout Rule

Do not build a new installer until the local app passes:

```bash
npm run check:youtube-unified
```

and one real `구글 글래스` manual job produces either:

- a final rendered video, or
- a precise Flow submit failure artifact proving where Google Flow blocked.

Only after that:

```bash
npm run dist
```

Then install from:

```text
C:\Users\amd\hermes\dist-electron\Hermes YouTube Studio Setup 1.0.0.exe
```

---

## Commit Plan

Commit in small checkpoints:

```bash
git add youtube-workflow-stages.mjs scripts/check-unified-youtube-workflow.mjs
git commit -m "feat: add shared youtube workflow stages"
```

```bash
git add automation/gemini-research-draft.mjs youtube-workflow-stages.mjs
git commit -m "feat: add gemini research draft stage"
```

```bash
git add electron/services/youtube-job-service.mjs electron/services/job-progress-events.mjs electron/renderer/app.js
git commit -m "feat: route electron youtube jobs through shared stages"
```

```bash
git add telegram-flow-news-bot.mjs scripts/check-youtube-job-runner.mjs
git commit -m "feat: route telegram youtube jobs through shared stages"
```

```bash
git add automation/google-flow-media.mjs
git commit -m "fix: verify google flow generation start"
```

```bash
git add scripts/smoke-electron-youtube-mock-job.mjs package.json
git commit -m "test: add unified youtube workflow smoke check"
```

---

## Self Review

- This plan directly answers why Hermes worked while Electron did not: the shared runner exists, but the effective draft and Flow behavior is split.
- The plan does not preserve duplicate primary engines. Telegram and Electron both become adapters over the same stages.
- The plan keeps OpenRouter as fallback, not as the Electron primary path.
- The plan adds Flow submit verification so the app no longer jumps to Flow and hangs without proof.
- The plan includes fast mock testing and one real Google Flow manual verification before packaging.
