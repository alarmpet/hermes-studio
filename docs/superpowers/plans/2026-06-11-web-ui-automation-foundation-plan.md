# Web UI Automation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Playwright-first Web UI automation foundation in Hermes before adding Grok or Leonardo providers, so every browser-driven media provider must prove submit, generation, download, and original-media QA with traceable evidence.

**Architecture:** Add a provider-neutral Playwright harness around existing persistent Chrome profile automation. Google Flow remains the first consumer, but submit/focus/download/failure diagnostics move toward reusable helpers that future Leonardo and Grok Web UI providers can share. Stagehand or Browser Use is not introduced as a dependency in this plan; instead, the plan reserves an optional `observe/extract` adapter seam while keeping final decisions deterministic through Playwright, files, network responses, and media probes.

**Tech Stack:** Node.js ESM/CommonJS mixed repo, Playwright 1.60, Electron, ffmpeg-static, existing `youtube-workflow-stages.mjs`, existing `automation/google-flow-media.mjs`, contract scripts under `scripts/`.

---

## Non-Negotiable Policy

- A Web UI provider can complete a scene only when Hermes has a real provider-origin image/video file on disk.
- Local fallback media must never mark a live Web UI scene complete unless the job explicitly enables mock or local fallback mode.
- A clicked button is not proof of generation. Completion requires media URL, Playwright download, local file bytes, content-type, dimensions, and for video, duration.
- Stagehand/LLM-style assist can suggest UI targets, but cannot be the final success oracle.
- Every failed scene must leave a compact evidence bundle: screenshot, page text snapshot, provider state JSON, and if tracing is enabled, a Playwright trace path.

## File Structure

- Create `automation/web-ui-provider-harness.mjs`
  - Owns persistent Playwright context setup, profile lock release, optional trace lifecycle, screenshot/snapshot helpers, submit action evidence, and media validation helpers.
- Create `automation/web-ui-auth-window.mjs`
  - Extracts the existing app-managed Chrome profile release logic from Flow/Gemini/ChatGPT-style automation so shared harness launches do not fail on locked profile directories.
- Create `automation/web-ui-provider-contract.mjs`
  - Defines normalized provider result and failure shape through plain JS helper functions. This avoids TypeScript migration.
- Create `scripts/check-web-ui-provider-harness-contract.mjs`
  - Static contract test for the harness API, trace paths, result validation, and no silent fallback success.
- Create `scripts/check-web-ui-provider-media-required.mjs`
  - Static contract test proving live provider failures use `*_MEDIA_REQUIRED` style failures and do not complete through local fallback.
- Modify `automation/google-flow-media.mjs`
  - Use the common harness helpers for evidence files and trace lifecycle.
  - Keep Flow-specific selectors and mode switching local to this file.
- Modify `youtube-workflow-stages.mjs`
  - Preserve the current `FLOW_IMAGE_MEDIA_REQUIRED` live failure policy.
  - Route provider result metadata into scene media manifest consistently.
- Modify `scripts/analyze-youtube-output.mjs`
  - Keep local fallback as an error unless explicit job options allow it.
  - Add `providerOrigin` and `providerEvidence` awareness when present.
- Modify `package.json`
  - Add the two new checks to `check:flow-policy-safety` or a new `check:web-ui-automation`.
- Modify `timeline.md`
  - Record the architectural decision after implementation and verification only.

## Review Disposition

The review document `HERMES_WEB_UI_AUTOMATION_FOUNDATION_PLAN_REVIEW.md` raised several implementation risks. The following items are accepted into this plan because they match the current codebase:

- **Accepted P0: profile lock release.** Existing `automation/google-flow-media.mjs` calls `releaseAppManagedAuthWindow(profileDir)` before `chromium.launchPersistentContext`. The shared harness must preserve this, otherwise locked profile directories can break Flow/Leonardo/Grok launches.
- **Accepted P0: persistent context options.** Existing Flow automation forces `locale: "ko-KR"` and `acceptDownloads: true`; the shared harness must preserve both because UI text classification and download handling depend on them.
- **Accepted P1: trace storage control.** Always saving Playwright traces for every scene can create large job folders. The harness should start traces only when `job.options.enableWebUiTracing === true` or `HERMES_ENABLE_WEB_UI_TRACE=1`, and save trace ZIPs only on failure unless `saveSuccessfulWebUiTrace` is explicitly true.
- **Accepted P1: retry failed scene compatibility.** Media-required failures should remain hard failures for final QA, but they must persist `retryable`, `actionRequired`, and evidence fields in `scene-media-manifest.json` so the existing Retry Failed Scenes flow can resume from the failed scene.
- **Accepted P2: LLM/Stagehand boundary.** Stagehand/Browser Use remains assist-only and cannot become a success oracle.
- **Deferred: provider registry restructuring.** A larger `asset-provider` registry is useful for Leonardo/Grok, but it is outside this foundation plan. The provider result contract introduced here is enough for the next provider-specific plan.

## Provider Result Shape

Use this normalized shape for all Web UI providers:

```js
{
  ok: true,
  provider: "google-flow",
  providerOrigin: "web-ui",
  sceneOrder: 1,
  outputMode: "image",
  path: "C:\\Users\\amd\\AppData\\Roaming\\hermes\\outputs\\desktop\\youtube-...\\scene_1_flow.png",
  contentType: "image/png",
  bytes: 123456,
  width: 1920,
  height: 1080,
  durationSeconds: 0,
  sourceUrl: "blob:https://...",
  evidence: {
    screenshotPath: "...\\scene_1_flow_screen.png",
    snapshotPath: "...\\scene_1_webui_snapshot.json",
    tracePath: "...\\scene_1_webui_trace.zip",
    statusPath: "...\\scene_1_flow_status.json"
  }
}
```

Use this normalized failure shape:

```js
{
  ok: false,
  provider: "google-flow",
  providerOrigin: "web-ui",
  sceneOrder: 1,
  failureCode: "FLOW_IMAGE_MEDIA_REQUIRED",
  actionRequired: true,
  retryable: true,
  message: "Google Flow did not expose usable media.",
  evidence: {
    screenshotPath: "...\\scene_1_flow_screen.png",
    snapshotPath: "...\\scene_1_webui_snapshot.json",
    tracePath: "...\\scene_1_webui_trace.zip",
    statusPath: "...\\scene_1_flow_status.json"
  }
}
```

---

### Task 1: Add Provider-Neutral Contract Helpers

**Files:**
- Create: `automation/web-ui-provider-contract.mjs`
- Create: `scripts/check-web-ui-provider-harness-contract.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing contract test**

Create `scripts/check-web-ui-provider-harness-contract.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const contract = readFileSync(resolve(root, "automation/web-ui-provider-contract.mjs"), "utf8");
const packageJson = readFileSync(resolve(root, "package.json"), "utf8");

assert.match(contract, /export function createWebUiProviderSuccess/, "contract should expose success result builder");
assert.match(contract, /export function createWebUiProviderFailure/, "contract should expose failure result builder");
assert.match(contract, /providerOrigin:\s*"web-ui"/, "provider results should mark web-ui origin");
assert.match(contract, /assertProviderMediaResult/, "contract should expose media result validator");
assert.match(contract, /bytes[\s\S]*>[\s\S]*0/, "validator should require non-empty media bytes");
assert.match(contract, /contentType/, "validator should require content type");
assert.match(contract, /evidence/, "provider results should carry evidence paths");
assert.match(packageJson, /check-web-ui-provider-harness-contract\.mjs/, "package checks should include web UI provider harness contract");

console.log(JSON.stringify({ ok: true, checked: "web-ui-provider-harness-contract" }));
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node scripts\check-web-ui-provider-harness-contract.mjs
```

Expected: FAIL because `automation/web-ui-provider-contract.mjs` does not exist.

- [ ] **Step 3: Implement the contract helper**

Create `automation/web-ui-provider-contract.mjs`:

```js
import { statSync } from "node:fs";

export function createWebUiProviderSuccess({
  provider,
  sceneOrder,
  outputMode,
  path,
  contentType,
  bytes = 0,
  width = 0,
  height = 0,
  durationSeconds = 0,
  sourceUrl = "",
  evidence = {},
  extra = {},
} = {}) {
  return {
    ok: true,
    provider,
    providerOrigin: "web-ui",
    sceneOrder,
    outputMode,
    path,
    contentType,
    bytes,
    width,
    height,
    durationSeconds,
    sourceUrl,
    evidence,
    ...extra,
  };
}

export function createWebUiProviderFailure({
  provider,
  sceneOrder,
  failureCode,
  message,
  retryable = true,
  actionRequired = true,
  evidence = {},
  details = {},
} = {}) {
  return {
    ok: false,
    provider,
    providerOrigin: "web-ui",
    sceneOrder,
    failureCode,
    message,
    retryable,
    actionRequired,
    evidence,
    details,
  };
}

export function assertProviderMediaResult(result = {}) {
  if (!result.ok) {
    throw new Error(result.message || `${result.provider || "Provider"} did not return usable media.`);
  }
  if (result.providerOrigin !== "web-ui") {
    throw new Error(`WEB_UI_PROVIDER_ORIGIN_REQUIRED: providerOrigin=${result.providerOrigin || ""}`);
  }
  if (!result.path) {
    throw new Error("WEB_UI_PROVIDER_MEDIA_PATH_REQUIRED");
  }
  const stat = statSync(result.path);
  if (!stat.size || stat.size <= 0 || Number(result.bytes || stat.size) <= 0) {
    throw new Error(`WEB_UI_PROVIDER_EMPTY_MEDIA: ${result.path}`);
  }
  if (!String(result.contentType || "").includes("/")) {
    throw new Error(`WEB_UI_PROVIDER_CONTENT_TYPE_REQUIRED: ${result.path}`);
  }
  return { ...result, bytes: Number(result.bytes || stat.size) };
}
```

- [ ] **Step 4: Add the contract check to package scripts**

Modify `package.json` by adding a new script:

```json
"check:web-ui-automation": "node scripts/check-web-ui-provider-harness-contract.mjs"
```

Then append `&& npm run check:web-ui-automation` to the main `check` script after `node ./scripts/check-webwright-diagnostics-contract.mjs`.

- [ ] **Step 5: Verify**

Run:

```powershell
node scripts\check-web-ui-provider-harness-contract.mjs
npm.cmd run check:web-ui-automation
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```powershell
git add automation/web-ui-provider-contract.mjs scripts/check-web-ui-provider-harness-contract.mjs package.json
git commit -m "feat: add web ui provider media contract"
```

---

### Task 2: Add Playwright Harness Evidence, Profile Release, and Conditional Trace Helpers

**Files:**
- Create: `automation/web-ui-auth-window.mjs`
- Create: `automation/web-ui-provider-harness.mjs`
- Modify: `scripts/check-web-ui-provider-harness-contract.mjs`

- [ ] **Step 1: Extend the failing test**

Append these assertions to `scripts/check-web-ui-provider-harness-contract.mjs`:

```js
const harness = readFileSync(resolve(root, "automation/web-ui-provider-harness.mjs"), "utf8");

assert.match(harness, /export async function createWebUiProviderContext/, "harness should create persistent Playwright contexts");
assert.match(harness, /launchPersistentContext/, "harness should use persistent browser profiles for logged-in sessions");
assert.match(harness, /releaseAppManagedAuthWindow/, "harness should release app-managed profile locks before launching");
assert.match(harness, /locale:\s*"ko-KR"/, "harness should preserve Korean locale for stable UI labels");
assert.match(harness, /acceptDownloads:\s*true/, "harness should allow provider media downloads");
assert.match(harness, /startWebUiTrace/, "harness should support Playwright trace start");
assert.match(harness, /stopWebUiTrace/, "harness should support Playwright trace stop");
assert.match(harness, /enableWebUiTracing/, "harness should gate tracing behind job options or environment");
assert.match(harness, /saveSuccessfulWebUiTrace/, "harness should avoid successful trace ZIPs unless explicitly requested");
assert.match(harness, /writeWebUiEvidence/, "harness should persist screenshots and snapshots");
assert.match(harness, /page\.screenshot/, "evidence helper should save screenshots");
assert.match(harness, /textContent/, "evidence helper should save page text snapshots");
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node scripts\check-web-ui-provider-harness-contract.mjs
```

Expected: FAIL because `automation/web-ui-provider-harness.mjs` and `automation/web-ui-auth-window.mjs` do not exist.

- [ ] **Step 3: Extract the profile release helper**

Create `automation/web-ui-auth-window.mjs`:

```js
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessRunning(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

async function killChromeHoldingProfile(profileDir) {
  const { execSync } = await import("node:child_process");
  const normalizedDir = String(profileDir || "").replace(/\\/g, "\\\\").replace(/'/g, "''");
  if (!normalizedDir) return;
  try {
    const raw = execSync(
      `wmic process where "name='chrome.exe' and CommandLine like '%${normalizedDir}%'" get ProcessId /format:value`,
      { encoding: "utf8", timeout: 8000 },
    );
    const pids = [...raw.matchAll(/ProcessId=(\d+)/gi)].map((match) => Number(match[1])).filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(pid);
      } catch {
        // Process may have exited between WMIC query and kill.
      }
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (!pids.some(isProcessRunning)) break;
      await delay(250);
    }
  } catch {
    // WMIC may be unavailable on some Windows builds. The lock-file path below
    // still handles Hermes-owned browser windows.
  }
}

export async function releaseAppManagedAuthWindow(profileDir) {
  if (!profileDir) return;
  const lockPath = join(profileDir, "hermes-profile.lock.json");
  if (existsSync(lockPath)) {
    const lock = JSON.parse(await readFile(lockPath, "utf8").catch(() => "{}"));
    if (lock.pid && isProcessRunning(lock.pid)) {
      try {
        process.kill(Number(lock.pid));
      } catch {
        // Browser may already have exited.
      }
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (!isProcessRunning(lock.pid)) break;
        await delay(250);
      }
    }
    await rm(lockPath, { force: true });
  }
  await killChromeHoldingProfile(profileDir);
}
```

- [ ] **Step 4: Implement the harness**

Create `automation/web-ui-provider-harness.mjs`:

```js
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { maximizeChromiumWindow } from "./chromium-window-bounds.mjs";
import { releaseAppManagedAuthWindow } from "./web-ui-auth-window.mjs";

function shouldEnableWebUiTracing(jobOptions = {}) {
  return Boolean(jobOptions.enableWebUiTracing || process.env.HERMES_ENABLE_WEB_UI_TRACE === "1");
}

export async function createWebUiProviderContext({
  provider,
  profileDir,
  chromePath,
  jobOptions = {},
  headless = false,
  viewport = { width: 1920, height: 1080 },
  windowSize = "1936,1100",
} = {}) {
  if (!provider) throw new Error("WEB_UI_PROVIDER_REQUIRED");
  if (!profileDir) throw new Error("WEB_UI_PROFILE_DIR_REQUIRED");
  await releaseAppManagedAuthWindow(profileDir);
  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    executablePath: chromePath || undefined,
    viewport,
    locale: "ko-KR",
    acceptDownloads: true,
    args: [
      `--window-size=${windowSize}`,
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  const page = context.pages()[0] || await context.newPage();
  await maximizeChromiumWindow(context, page).catch(() => {});
  return { context, page, traceEnabled: shouldEnableWebUiTracing(jobOptions) };
}

export async function startWebUiTrace({ context, jobDir, sceneOrder, provider, enabled = false } = {}) {
  if (!enabled || !context || !jobDir || !sceneOrder || !provider) return "";
  await mkdir(jobDir, { recursive: true });
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: false,
    title: `${provider}-scene-${sceneOrder}`,
  });
  return join(jobDir, `scene_${sceneOrder}_${provider}_trace.zip`);
}

export async function stopWebUiTrace({ context, tracePath, saveTrace = false, saveSuccessfulWebUiTrace = false } = {}) {
  if (!context || !tracePath) return "";
  const shouldSave = Boolean(saveTrace || saveSuccessfulWebUiTrace);
  if (shouldSave) {
    await context.tracing.stop({ path: tracePath }).catch(async () => {
      await context.tracing.stop().catch(() => {});
    });
    return tracePath;
  }
  await context.tracing.stop().catch(() => {});
  return "";
}

export async function writeWebUiEvidence({
  page,
  jobDir,
  provider,
  sceneOrder,
  label = "screen",
  extra = {},
} = {}) {
  if (!page || !jobDir || !provider || !sceneOrder) {
    throw new Error("WEB_UI_EVIDENCE_INPUT_REQUIRED");
  }
  await mkdir(jobDir, { recursive: true });
  const screenshotPath = join(jobDir, `scene_${sceneOrder}_${provider}_${label}.png`);
  const snapshotPath = join(jobDir, `scene_${sceneOrder}_${provider}_${label}_snapshot.json`);
  const text = await page.locator("body").textContent({ timeout: 3000 }).catch(() => "");
  const url = page.url();
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  await writeFile(snapshotPath, JSON.stringify({
    provider,
    sceneOrder,
    label,
    url,
    text,
    extra,
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
  return { screenshotPath, snapshotPath };
}
```

- [ ] **Step 5: Verify**

Run:

```powershell
node --check automation\web-ui-auth-window.mjs
node --check automation\web-ui-provider-harness.mjs
node scripts\check-web-ui-provider-harness-contract.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add automation/web-ui-auth-window.mjs automation/web-ui-provider-harness.mjs scripts/check-web-ui-provider-harness-contract.mjs
git commit -m "feat: add playwright web ui provider harness"
```

---

### Task 3: Add Media-Required QA Gate for Web UI Providers

**Files:**
- Create: `scripts/check-web-ui-provider-media-required.mjs`
- Modify: `scripts/analyze-youtube-output.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing media-required test**

Create `scripts/check-web-ui-provider-media-required.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const analyzer = readFileSync(resolve(root, "scripts/analyze-youtube-output.mjs"), "utf8");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");
const packageJson = readFileSync(resolve(root, "package.json"), "utf8");

assert.match(stages, /FLOW_IMAGE_MEDIA_REQUIRED/, "Flow live image failures should stop with media-required failure");
assert.match(analyzer, /FLOW_IMAGE_LOCAL_FALLBACK/, "Analyzer should know local fallback is not original provider media");
assert.match(analyzer, /localFallbackAllowed/, "Analyzer should distinguish explicitly allowed local fallback");
assert.match(analyzer, /severity:\s*localFallbackAllowed \? "warning" : "error"/, "Unapproved local fallback should be an error");
assert.match(analyzer, /providerOrigin/, "Analyzer should inspect provider origin when present in scene manifest");
assert.match(analyzer, /WEB_UI_PROVIDER_MEDIA_REQUIRED/, "Analyzer should fail web-ui scene entries without provider media");
assert.match(packageJson, /check-web-ui-provider-media-required\.mjs/, "package checks should include web UI media-required test");

console.log(JSON.stringify({ ok: true, checked: "web-ui-provider-media-required" }));
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node scripts\check-web-ui-provider-media-required.mjs
```

Expected: FAIL because analyzer does not inspect `providerOrigin` yet and package script does not include this check.

- [ ] **Step 3: Update analyzer provider-origin logic**

In `scripts/analyze-youtube-output.mjs`, after scenes are loaded and before final `return`, add:

```js
  const webUiProviderMediaIssues = [];
  for (const scene of scenes) {
    if (scene.providerOrigin !== "web-ui") continue;
    const hasProviderMedia = Boolean(
      scene.originalPath
      && scene.sourceContentType
      && !String(scene.fallback || scene.fallbackReason || "").toLowerCase().includes("local")
    );
    if (!hasProviderMedia) {
      webUiProviderMediaIssues.push({
        order: scene.order,
        provider: scene.provider || scene.providerName || "",
        code: "WEB_UI_PROVIDER_MEDIA_REQUIRED",
      });
    }
  }
  if (webUiProviderMediaIssues.length) {
    details.webUiProviderMediaIssues = webUiProviderMediaIssues;
    failureCodes.push("WEB_UI_PROVIDER_MEDIA_REQUIRED");
    qualityWarnings.push({
      code: "WEB_UI_PROVIDER_MEDIA_REQUIRED",
      severity: "error",
      message: "One or more Web UI provider scenes completed without verified original provider media.",
      sceneOrders: webUiProviderMediaIssues.map((item) => item.order),
    });
  }
```

If the analyzer already has a better location for scene-level QA loops, place the block next to local fallback QA so both policies are visible together.

- [ ] **Step 4: Add the test to package scripts**

Modify `package.json`:

```json
"check:web-ui-automation": "node scripts/check-web-ui-provider-harness-contract.mjs && node scripts/check-web-ui-provider-media-required.mjs"
```

- [ ] **Step 5: Verify**

Run:

```powershell
node scripts\check-web-ui-provider-media-required.mjs
npm.cmd run check:web-ui-automation
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add scripts/analyze-youtube-output.mjs scripts/check-web-ui-provider-media-required.mjs package.json
git commit -m "fix: require verified web ui provider media"
```

---

### Task 4: Wire Harness Evidence into Google Flow Without Changing Flow Selectors

**Files:**
- Modify: `automation/google-flow-media.mjs`
- Modify: `scripts/check-desktop-progress-feedback.mjs`
- Modify: `scripts/check-flow-policy-safety.mjs` only if this repo has that aggregator as a standalone file; otherwise modify `package.json` script only.

- [ ] **Step 1: Write the failing evidence assertions**

Add these assertions to `scripts/check-desktop-progress-feedback.mjs`:

```js
assert.match(flowAutomation, /writeWebUiEvidence/, "Flow automation should use shared web UI evidence capture");
assert.match(flowAutomation, /startWebUiTrace/, "Flow automation should start shared Playwright traces");
assert.match(flowAutomation, /stopWebUiTrace/, "Flow automation should stop shared Playwright traces");
assert.match(flowAutomation, /provider:\s*"google-flow"/, "Flow provider evidence should identify google-flow");
assert.match(flowAutomation, /jobOptions/, "Flow automation should pass job options into the shared harness");
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node scripts\check-desktop-progress-feedback.mjs
```

Expected: FAIL because Flow still uses local screenshot helpers only.

- [ ] **Step 3: Import harness helpers in Flow automation**

In `automation/google-flow-media.mjs`, add:

```js
import {
  createWebUiProviderContext,
  startWebUiTrace,
  stopWebUiTrace,
  writeWebUiEvidence,
} from "./web-ui-provider-harness.mjs";
```

- [ ] **Step 4: Add job options to the Flow automation signature**

In `generateGoogleFlowVideoFromPrompt`, add a `jobOptions = {}` parameter:

```js
export async function generateGoogleFlowVideoFromPrompt({
  prompt,
  safeFallbackPrompt,
  jobDir,
  sceneOrder = 1,
  chromePath,
  profileDir,
  outputMode = "video",
  aspectRatio = "9:16",
  ingredientImagePaths = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onProgress,
  flowPacer,
  flowAccountSlotId = "default",
  jobId = "",
  jobOptions = {},
}) {
```

Then in `youtube-workflow-stages.mjs`, pass the job options into both Flow calls:

```js
          jobOptions: job?.options || {},
```

- [ ] **Step 5: Replace persistent context launch**

Inside `generateGoogleFlowVideoFromPrompt`, replace the direct `chromium.launchPersistentContext` block with:

```js
  const { context, page } = await createWebUiProviderContext({
    provider: "google-flow",
    profileDir,
    chromePath,
    jobOptions,
    headless: false,
    viewport: { width: 1920, height: 1080 },
    windowSize: "1936,1100",
  });
  const tracePath = await startWebUiTrace({
    context,
    jobDir,
    sceneOrder,
    provider: "flow",
    enabled: Boolean(jobOptions?.enableWebUiTracing || process.env.HERMES_ENABLE_WEB_UI_TRACE === "1"),
  });
```

Keep existing Flow-specific navigation, mode selection, prompt entry, menu closing, credit rejection, and waiting logic unchanged.

- [ ] **Step 6: Stop trace in success and failure paths**

Before returning a successful Flow media object, include:

```js
      const finalTracePath = await stopWebUiTrace({
        context,
        tracePath,
        saveSuccessfulWebUiTrace: Boolean(jobOptions?.saveSuccessfulWebUiTrace),
      });
```

Then add evidence metadata to the returned object:

```js
      evidence: {
        ...(media.evidence || {}),
        tracePath: finalTracePath,
      },
      provider: "google-flow",
      providerOrigin: "web-ui",
```

In catch/finally paths before throwing, call:

```js
    const finalTracePath = await stopWebUiTrace({
      context,
      tracePath,
      saveTrace: Boolean(tracePath),
    });
    const evidence = await writeWebUiEvidence({
      page,
      jobDir,
      provider: "flow",
      sceneOrder,
      label: "failure",
      extra: { failureCode: error?.failureCode || "", message: error?.message || "" },
    }).catch(() => ({}));
    error.details = {
      ...(error.details || {}),
      evidence: {
        ...(error.details?.evidence || {}),
        ...evidence,
        tracePath: finalTracePath,
      },
    };
```

- [ ] **Step 7: Verify**

Run:

```powershell
node --check automation\google-flow-media.mjs
node scripts\check-desktop-progress-feedback.mjs
npm.cmd run check:flow-policy-safety
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add automation/google-flow-media.mjs youtube-workflow-stages.mjs scripts/check-desktop-progress-feedback.mjs
git commit -m "feat: capture shared web ui evidence for flow"
```

---

### Task 5: Preserve Provider Metadata in Scene Media Manifest

**Files:**
- Modify: `youtube-workflow.mjs`
- Modify: `youtube-workflow-stages.mjs`
- Create: `scripts/check-web-ui-provider-manifest-contract.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing manifest contract test**

Create `scripts/check-web-ui-provider-manifest-contract.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");
const packageJson = readFileSync(resolve(root, "package.json"), "utf8");

assert.match(stages, /providerOrigin/, "workflow stages should return provider origin metadata");
assert.match(stages, /provider:\s*"google-flow"/, "Flow scene media should identify provider");
assert.match(stages, /evidence/, "Flow scene media should preserve evidence paths");
assert.match(workflow, /providerOrigin/, "scene media manifest writer should persist provider origin");
assert.match(workflow, /evidence/, "scene media manifest writer should persist evidence paths");
assert.match(workflow, /retryable/, "scene media manifest writer should persist retryable failure state");
assert.match(workflow, /actionRequired/, "scene media manifest writer should persist action-required failure state");
assert.match(packageJson, /check-web-ui-provider-manifest-contract\.mjs/, "package checks should include provider manifest contract");

console.log(JSON.stringify({ ok: true, checked: "web-ui-provider-manifest-contract" }));
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node scripts\check-web-ui-provider-manifest-contract.mjs
```

Expected: FAIL until workflow and package scripts preserve/check provider metadata.

- [ ] **Step 3: Add provider metadata to stage return objects**

In `youtube-workflow-stages.mjs`, for each successful Flow image/video return object, add:

```js
        provider: media.provider || "google-flow",
        providerOrigin: media.providerOrigin || "web-ui",
        evidence: media.evidence || {},
```

For rendered image-motion scene returns, keep the provider metadata from `imageMedia`:

```js
        provider: imageMedia.provider || "google-flow",
        providerOrigin: imageMedia.providerOrigin || "web-ui",
        evidence: imageMedia.evidence || {},
```

- [ ] **Step 4: Ensure manifest writer keeps the fields**

In `youtube-workflow.mjs`, locate the scene media manifest serialization around `scene-media-manifest.json`. Ensure each scene item includes:

```js
      provider: media.provider || "",
      providerOrigin: media.providerOrigin || "",
      evidence: media.evidence || {},
```

If the manifest already spreads `...media`, add a test-visible explicit mapping rather than relying on spread.

- [ ] **Step 5: Preserve retry metadata on failed provider scenes**

In the `catch` block that writes failed scene media manifest records in `youtube-workflow.mjs`, add:

```js
          provider: error.details?.provider || error.provider || "",
          providerOrigin: error.details?.providerOrigin || error.providerOrigin || "",
          evidence: error.details?.evidence || error.evidence || {},
          retryable: Boolean(error.retryable || error.details?.retryable),
```

Keep the existing `actionRequired` field:

```js
          actionRequired: Boolean(error.actionRequired || error.details?.actionRequired),
```

This preserves hard-fail semantics for final QA while keeping the existing `Retry Failed Scenes` UX capable of resuming from the failed scene.

- [ ] **Step 6: Add package check**

Modify `package.json`:

```json
"check:web-ui-automation": "node scripts/check-web-ui-provider-harness-contract.mjs && node scripts/check-web-ui-provider-media-required.mjs && node scripts/check-web-ui-provider-manifest-contract.mjs"
```

- [ ] **Step 7: Verify**

Run:

```powershell
node scripts\check-web-ui-provider-manifest-contract.mjs
npm.cmd run check:web-ui-automation
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add youtube-workflow.mjs youtube-workflow-stages.mjs scripts/check-web-ui-provider-manifest-contract.mjs package.json
git commit -m "feat: persist web ui provider manifest metadata"
```

---

### Task 6: Add Provider-Agnostic Smoke Fixture for Future Grok/Leonardo Work

**Files:**
- Create: `scripts/check-web-ui-provider-smoke-fixture.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the smoke fixture test**

Create `scripts/check-web-ui-provider-smoke-fixture.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import {
  assertProviderMediaResult,
  createWebUiProviderFailure,
  createWebUiProviderSuccess,
} from "../automation/web-ui-provider-contract.mjs";

const jobDir = mkdtempSync(join(tmpdir(), "hermes-web-ui-provider-smoke-"));
try {
  const imagePath = join(jobDir, "scene_1_provider.png");
  await sharp({
    create: {
      width: 64,
      height: 36,
      channels: 3,
      background: "#224488",
    },
  }).png().toFile(imagePath);
  const bytes = Number((await import("node:fs")).statSync(imagePath).size);
  const success = createWebUiProviderSuccess({
    provider: "fixture-provider",
    sceneOrder: 1,
    outputMode: "image",
    path: imagePath,
    contentType: "image/png",
    bytes,
    width: 64,
    height: 36,
    evidence: {
      screenshotPath: join(jobDir, "scene_1_fixture_screen.png"),
      snapshotPath: join(jobDir, "scene_1_fixture_snapshot.json"),
    },
  });
  assert.equal(assertProviderMediaResult(success).bytes, bytes);
  const failure = createWebUiProviderFailure({
    provider: "fixture-provider",
    sceneOrder: 2,
    failureCode: "FIXTURE_MEDIA_REQUIRED",
    message: "Fixture provider did not expose media.",
  });
  assert.equal(failure.ok, false);
  assert.equal(failure.providerOrigin, "web-ui");
  writeFileSync(join(jobDir, "fixture-provider-status.json"), JSON.stringify({ success, failure }, null, 2), "utf8");
  assert.ok(existsSync(join(jobDir, "fixture-provider-status.json")));
} finally {
  rmSync(jobDir, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, checked: "web-ui-provider-smoke-fixture" }));
```

- [ ] **Step 2: Add package check**

Modify `package.json`:

```json
"check:web-ui-automation": "node scripts/check-web-ui-provider-harness-contract.mjs && node scripts/check-web-ui-provider-media-required.mjs && node scripts/check-web-ui-provider-manifest-contract.mjs && node scripts/check-web-ui-provider-smoke-fixture.mjs"
```

- [ ] **Step 3: Verify**

Run:

```powershell
node scripts\check-web-ui-provider-smoke-fixture.mjs
npm.cmd run check:web-ui-automation
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add scripts/check-web-ui-provider-smoke-fixture.mjs package.json
git commit -m "test: add web ui provider smoke fixture"
```

---

### Task 7: Package and Desktop Shortcut Verification

**Files:**
- Modify: `timeline.md`

- [ ] **Step 1: Run focused verification**

Run:

```powershell
npm.cmd run check:web-ui-automation
npm.cmd run check:flow-policy-safety
npm.cmd run check:flow-output-mode
npm.cmd run check:final-output-qa
```

Expected: all PASS.

- [ ] **Step 2: Stop packaged app processes before packaging**

Run:

```powershell
Get-Process | Where-Object { $_.Path -like 'C:\Users\amd\hermes\dist-electron\win-unpacked\*' } | Stop-Process -Force -ErrorAction SilentlyContinue
```

Expected: no output or stopped Hermes packaged processes.

- [ ] **Step 3: Package Electron app**

Run:

```powershell
npm.cmd run electron:pack
```

Expected: PASS and updated `dist-electron\win-unpacked\Hermes YouTube Studio.exe`.

- [ ] **Step 4: Verify packaged runtime and shortcut**

Run:

```powershell
node scripts\check-packaged-runtime-contract.mjs
powershell -ExecutionPolicy Bypass -File scripts\check-shortcut.ps1
```

Expected:

```text
{"ok":true,"checked":"packaged-runtime-contract",...}
EXE exists: C:\Users\amd\hermes\dist-electron\win-unpacked\Hermes YouTube Studio.exe
```

- [ ] **Step 5: Update timeline**

Append to `timeline.md`:

```md
## 2026-06-11 - Architecture - Web UI automation foundation

- Added a Playwright-first Web UI provider foundation before adding Leonardo or Grok providers.
- Introduced provider-neutral success/failure media contracts, evidence capture, optional tracing, and manifest metadata requirements.
- Kept Stagehand/Browser Use as future assist layers only; final success remains based on real provider media files and deterministic QA.
- Verified Flow policy safety, output mode, final output QA, packaged runtime, and desktop shortcut.
```

- [ ] **Step 6: Commit**

```powershell
git add timeline.md
git commit -m "docs: record web ui automation foundation"
```

---

## Execution Notes for Future Leonardo/Grok Provider Plans

After this foundation lands, write separate provider-specific plans:

- Leonardo Web UI provider
  - URL/profile setup
  - prompt input
  - model/style preset selection
  - image generation wait
  - provider media download
  - `LEONARDO_MEDIA_REQUIRED` failure

- Grok/SuperGrok Web UI provider
  - URL/profile setup
  - prompt input
  - image generation wait
  - image-to-video flow only if UI supports it in current account
  - provider media download
  - `GROK_MEDIA_REQUIRED` failure

Both provider-specific plans must reuse:

```js
createWebUiProviderContext()
startWebUiTrace()
stopWebUiTrace()
writeWebUiEvidence()
createWebUiProviderSuccess()
createWebUiProviderFailure()
assertProviderMediaResult()
```

## Self-Review

- Spec coverage: The plan implements the discussed Playwright-first approach, reserves Stagehand/Browser Use as assist-only layers, adds deterministic media verification, and blocks “clicked but no media” success.
- Placeholder scan: No placeholder implementation steps are left; each task names exact files and commands.
- Type consistency: Result fields use `provider`, `providerOrigin`, `evidence`, `path`, `contentType`, and `bytes` consistently across contract, harness, manifest, and analyzer tasks.
