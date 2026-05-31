# Webwright Diagnostics and ChatGPT Thumbnail Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Webwright-inspired diagnostic/recovery support to Hermes Studio browser automation, and make ChatGPT thumbnail generation failures visible, recoverable, and testable instead of silently falling back.

**Architecture:** Keep Hermes' existing Playwright automation as the production executor. Introduce Webwright as an optional diagnostic/craft layer that writes reproducible Playwright-style scripts, screenshots, and reports when ChatGPT/Flow/Gemini browser workflows fail. For ChatGPT thumbnails, split failure causes into authentication, image-tool selection, generation timeout, and download failure, then surface each cause in the Studio console and job artifacts.

**Tech Stack:** Electron, Node.js ESM, Playwright, Sharp, existing Hermes browser profiles, optional Python 3.10+ Webwright CLI/plugin, JSON artifacts under each job directory.

---

## Source Research Summary

- Microsoft Webwright is a terminal-native browser-agent framework that lets a model write executable Playwright code instead of predicting one click/type action at a time. Its persistent output is code, logs, screenshots, and reusable scripts, not only a live browser session. Source: [Microsoft Research blog](https://www.microsoft.com/en-us/research/articles/webwright-a-terminal-is-all-you-need-for-web-agents/), [GitHub README](https://github.com/microsoft/Webwright).
- Webwright is intentionally small and artifact-first: the README describes a runner, model endpoints, Playwright environments, tools such as `image_qa`/`self_reflection`, and `outputs/` trajectories. Source: [Webwright GitHub](https://github.com/microsoft/Webwright).
- It supports Python 3.10+, `playwright`, `pydantic`, `typer`, `httpx`, and can be used as a Codex/Hermes-style skill. Source: [raw README](https://raw.githubusercontent.com/microsoft/Webwright/main/README.md), [pyproject.toml](https://raw.githubusercontent.com/microsoft/Webwright/main/pyproject.toml).
- For Hermes Studio, the best fit is not replacing the current Playwright scripts. The best fit is a diagnostic/crafting layer for brittle authenticated web workflows: ChatGPT thumbnail generation, Google Flow mode selection, Gemini/Gems response waiting, and future browser QA.

## Current Root Cause: ChatGPT Thumbnail Failure

Latest evidence from `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1780209987837`:

- `chatgpt-thumbnail-result.json` says `reason: "no-new-generated-image"`.
- `toolState.imageTool.ok` is `false`, with `reason: "not-found"`.
- The `+` button was clicked, but ChatGPT's image creation tool was not selected.
- `chatgpt-thumbnail-failure.png` shows ChatGPT received a long normal text prompt and stayed in a spinner/generation state.

This is a separate failure from the earlier Cloudflare/human-verification case. The full failure taxonomy must be:

1. `CHATGPT_AUTH_REQUIRED`: saved profile is logged out.
2. `CHATGPT_HUMAN_VERIFICATION_REQUIRED`: Cloudflare or human check blocks composer access.
3. `CHATGPT_COMPOSER_NOT_FOUND`: ChatGPT loaded but no usable composer was exposed.
4. `CHATGPT_IMAGE_TOOL_NOT_FOUND`: composer exists, but the image creation tool cannot be selected.
5. `CHATGPT_TEXT_RESPONSE_INSTEAD_OF_IMAGE`: ChatGPT answered text or kept a text-mode spinner after prompt submission.
6. `CHATGPT_IMAGE_DOWNLOAD_FAILED`: generated image exists, but blob/CDN download failed.
7. `CHATGPT_IMAGE_TIMEOUT`: no new image candidate appears before timeout.

## Design Decision

Use Webwright only as an **optional browser diagnostics and script-crafting subsystem**.

Do not replace these existing production files with Webwright:

- `C:\Users\amd\hermes\automation\chatgpt-thumbnail-source.mjs`
- `C:\Users\amd\hermes\automation\google-flow-media.mjs`
- `C:\Users\amd\hermes\automation\gemini-research-draft.mjs`

Reason:

- Hermes already has stable, app-integrated Playwright code and job progress events.
- Webwright's value is code-as-action, reproducible scripts, self-verification, and artifact discipline.
- Running two full browser executors as production paths would create session lock conflicts, duplicated logs, and harder failures.

## File Structure

Create:

- `C:\Users\amd\hermes\electron\services\webwright-diagnostics-service.mjs`  
  Optional service that decides when to run Webwright diagnostics, creates a diagnostic workspace, and writes a normalized report.

- `C:\Users\amd\hermes\automation\chatgpt-thumbnail-diagnostics.mjs`  
  Lightweight Playwright diagnostic probe for ChatGPT thumbnail state. This is Hermes-native and can run even if Webwright is not installed.

- `C:\Users\amd\hermes\scripts\check-webwright-diagnostics-contract.mjs`  
  Static contract test for the diagnostic service and feature flag.

- `C:\Users\amd\hermes\scripts\check-chatgpt-thumbnail-failure-taxonomy.mjs`  
  Contract test that verifies all failure codes are emitted and persisted.

- `C:\Users\amd\hermes\docs\manuals\webwright-diagnostics-manual.md`  
  Operator manual: when to enable, where artifacts are saved, how to interpret reports.

Modify:

- `C:\Users\amd\hermes\package.json`  
  Add check scripts. Do not add Webwright as a hard dependency.

- `C:\Users\amd\hermes\electron\services\config-store.mjs`  
  Add `webwrightDiagnosticsEnabled`, default `false`.

- `C:\Users\amd\hermes\electron\services\job-progress-events.mjs`  
  Add progress event text for browser diagnostics.

- `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`  
  Trigger diagnostics only after known browser failure codes.

- `C:\Users\amd\hermes\electron\main.mjs`  
  Pass the full loaded config into `createYouTubeJob`; the current IPC call only passes `chromePath`, so `context.config` would otherwise be undefined and Webwright diagnostics would always skip.

- `C:\Users\amd\hermes\workflow-db-events.mjs`  
  Treat ChatGPT primary-provider failures and `CHATGPT_` failure codes as failure events so local thumbnail fallback does not hide the original browser failure from `task_failures`.

- `C:\Users\amd\hermes\automation\chatgpt-thumbnail-source.mjs`  
  Emit precise failure codes, collect tool-menu snapshots, avoid hiding image-tool failures behind generic timeout.

- `C:\Users\amd\hermes\pipeline\youtube-thumbnail.mjs`  
  Preserve local fallback, but return/persist `primaryProviderFailure` so Studio can show that ChatGPT failed.

- `C:\Users\amd\hermes\electron\renderer\app.js`  
  Show ChatGPT thumbnail failure cause and diagnostic artifact links in Console/Artifacts.

- `C:\Users\amd\hermes\scripts\check-local-studio-product.mjs`  
  Confirm local fallback remains available and ChatGPT remains the primary thumbnail path.

Not accepted from the external review:

- The review suggests updating a `triageDiagnostic` function in `bot_db_helper.py`. That function does not exist in the current codebase. The valid underlying concern is DB observability, so this plan updates `workflow-db-events.mjs`, which is the actual workflow-to-SQLite failure mirror.

---

### Task 1: Add ChatGPT Thumbnail Failure Taxonomy

**Files:**

- Modify: `C:\Users\amd\hermes\automation\chatgpt-thumbnail-source.mjs`
- Modify: `C:\Users\amd\hermes\pipeline\youtube-thumbnail.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-chatgpt-thumbnail-failure-taxonomy.mjs`
- Modify: `C:\Users\amd\hermes\package.json`

- [ ] **Step 1: Write the failing taxonomy contract**

Create `C:\Users\amd\hermes\scripts\check-chatgpt-thumbnail-failure-taxonomy.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "automation/chatgpt-thumbnail-source.mjs"), "utf8");
const pipeline = readFileSync(resolve(root, "pipeline/youtube-thumbnail.mjs"), "utf8");

for (const code of [
  "CHATGPT_AUTH_REQUIRED",
  "CHATGPT_HUMAN_VERIFICATION_REQUIRED",
  "CHATGPT_COMPOSER_NOT_FOUND",
  "CHATGPT_IMAGE_TOOL_NOT_FOUND",
  "CHATGPT_TEXT_RESPONSE_INSTEAD_OF_IMAGE",
  "CHATGPT_IMAGE_DOWNLOAD_FAILED",
  "CHATGPT_IMAGE_TIMEOUT",
]) {
  assert.match(source, new RegExp(code), `thumbnail automation must emit ${code}`);
}

assert.match(source, /chatgpt-thumbnail-tool-menu\.png/, "must save a screenshot after opening the ChatGPT tool menu");
assert.match(source, /chatgpt-thumbnail-result\.json/, "must persist thumbnail result JSON");
assert.match(pipeline, /primaryProviderFailure/, "thumbnail pipeline must preserve ChatGPT failure details after local fallback");
assert.match(pipeline, /local-composited/, "local fallback must remain available");

console.log(JSON.stringify({ ok: true, checked: "chatgpt-thumbnail-failure-taxonomy" }));
```

- [ ] **Step 2: Run the failing contract**

Run:

```powershell
node C:\Users\amd\hermes\scripts\check-chatgpt-thumbnail-failure-taxonomy.mjs
```

Expected: FAIL until every failure code and artifact is implemented.

- [ ] **Step 3: Implement explicit failure codes**

In `C:\Users\amd\hermes\automation\chatgpt-thumbnail-source.mjs`, add helpers:

```js
function createChatGptThumbnailError(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.details = details;
  return error;
}

async function persistThumbnailFailure({ outputDir, code, reason, message, screenshotPath = "", details = {} }) {
  const resultPath = join(outputDir, "chatgpt-thumbnail-result.json");
  await writeFile(resultPath, JSON.stringify({
    ok: false,
    provider: "chatgpt-authenticated-browser",
    reason,
    failureCode: code,
    actionRequired: ["CHATGPT_AUTH_REQUIRED", "CHATGPT_HUMAN_VERIFICATION_REQUIRED"].includes(code),
    message,
    screenshotPath,
    details: redactSensitiveDetails(details),
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
  return resultPath;
}

function redactSensitiveDetails(value) {
  return JSON.parse(JSON.stringify(value || {}, (key, item) => {
    if (/cookie|token|authorization|session/i.test(key)) return "[redacted]";
    return item;
  }));
}
```

Use these codes at the source:

- Composer missing with login text: `CHATGPT_AUTH_REQUIRED`.
- Composer missing with Cloudflare/human verification text or blank body at `chatgpt.com`: `CHATGPT_HUMAN_VERIFICATION_REQUIRED`.
- Composer missing with unknown page: `CHATGPT_COMPOSER_NOT_FOUND`.
- `clickImageCreationTool()` fails after opening `+`: `CHATGPT_IMAGE_TOOL_NOT_FOUND`.
- A response appears but no large image candidate appears: `CHATGPT_TEXT_RESPONSE_INSTEAD_OF_IMAGE`.
- Fetching the selected image URL fails: `CHATGPT_IMAGE_DOWNLOAD_FAILED`.
- Timeout with no candidate: `CHATGPT_IMAGE_TIMEOUT`.

- [ ] **Step 4: Save a tool-menu screenshot**

In `clickImageCreationTool(page, outputDir)`, after clicking `+`, save:

```js
await page.screenshot({
  path: join(outputDir, "chatgpt-thumbnail-tool-menu.png"),
  fullPage: true,
}).catch(() => {});
```

Then return a structured failure:

```js
return {
  ok: false,
  code: "CHATGPT_IMAGE_TOOL_NOT_FOUND",
  path: "tool-menu-opened",
  plus,
  imageTool: afterPlus,
};
```

- [ ] **Step 5: Preserve ChatGPT failure after local fallback**

In `C:\Users\amd\hermes\pipeline\youtube-thumbnail.mjs`, when ChatGPT fails, return local fallback with `primaryProviderFailure`:

```js
const fallback = await createLocalCompositedThumbnail({
  title: draft.title,
  script: draft.script,
  jobDir,
  aspectRatio,
  reason: chatgpt.error || chatgpt.message || "ChatGPT thumbnail generation failed",
});
return {
  ...fallback,
  primaryProvider: "chatgpt-authenticated-browser",
  primaryProviderFailure: {
    ok: false,
    code: chatgpt.code || "CHATGPT_UNKNOWN_FAILURE",
    message: chatgpt.error || chatgpt.message || "",
    resultPath: join(jobDir, "chatgpt-thumbnail-result.json"),
  },
};
```

- [ ] **Step 6: Add package check**

Modify `C:\Users\amd\hermes\package.json`:

```json
"check:chatgpt-thumbnail": "node scripts/check-chatgpt-thumbnail-pipeline.mjs && node scripts/check-chatgpt-thumbnail-failure-taxonomy.mjs"
```

- [ ] **Step 7: Verify**

Run:

```powershell
npm.cmd run check:chatgpt-thumbnail
```

Expected: PASS.

---

### Task 2: Add Hermes-Native ChatGPT Diagnostic Probe

**Files:**

- Create: `C:\Users\amd\hermes\automation\chatgpt-thumbnail-diagnostics.mjs`
- Modify: `C:\Users\amd\hermes\automation\chatgpt-thumbnail-source.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-chatgpt-thumbnail-diagnostics-contract.mjs`
- Modify: `C:\Users\amd\hermes\package.json`

- [ ] **Step 1: Write the diagnostic contract**

Create `C:\Users\amd\hermes\scripts\check-chatgpt-thumbnail-diagnostics-contract.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const diagnostics = readFileSync(resolve(root, "automation/chatgpt-thumbnail-diagnostics.mjs"), "utf8");
const source = readFileSync(resolve(root, "automation/chatgpt-thumbnail-source.mjs"), "utf8");

assert.match(diagnostics, /export async function diagnoseChatGptThumbnailState/, "diagnostic probe must export diagnoseChatGptThumbnailState");
assert.match(diagnostics, /composerFound/, "diagnostic report must include composerFound");
assert.match(diagnostics, /imageToolFound/, "diagnostic report must include imageToolFound");
assert.match(diagnostics, /accountLabel/, "diagnostic report should capture visible account label when available");
assert.match(diagnostics, /chatgpt-thumbnail-diagnostics\.json/, "diagnostic report must be persisted");
assert.match(diagnostics, /chatgpt-thumbnail-diagnostics\.png/, "diagnostic screenshot must be persisted");
assert.match(source, /diagnoseChatGptThumbnailState/, "thumbnail source should call diagnostics for image tool failures");
assert.match(source, /phase:\s*"composer-search"/, "thumbnail source should call diagnostics when the composer cannot be found");
assert.match(source, /phase:\s*"image-tool-selection"/, "thumbnail source should call diagnostics when the image tool cannot be selected");

console.log(JSON.stringify({ ok: true, checked: "chatgpt-thumbnail-diagnostics-contract" }));
```

- [ ] **Step 2: Create the diagnostic probe**

Create `C:\Users\amd\hermes\automation\chatgpt-thumbnail-diagnostics.mjs`:

```js
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function diagnoseChatGptThumbnailState({ page, outputDir, phase = "unknown" }) {
  const screenshotPath = join(outputDir, "chatgpt-thumbnail-diagnostics.png");
  const reportPath = join(outputDir, "chatgpt-thumbnail-diagnostics.json");
  const snapshot = await page.evaluate(() => {
    const textOf = (el) => [
      el.innerText,
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      el.getAttribute("data-testid"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 8 && rect.height > 8 && style.display !== "none" && style.visibility !== "hidden";
    };
    const buttons = Array.from(document.querySelectorAll("button,[role='button'],[role='menuitem'],a"))
      .filter(visible)
      .map((el) => ({ text: textOf(el).slice(0, 160), tag: el.tagName, role: el.getAttribute("role") || "" }))
      .filter((item) => item.text)
      .slice(0, 80);
    const composerFound = Boolean(document.querySelector("textarea,[contenteditable='true'],[role='textbox']"));
    const pageText = (document.body?.innerText || "").slice(0, 2000);
    const imageToolFound = buttons.some((item) => /이미지|image|picture|photo|그림|사진/i.test(item.text));
    const accountLabel = Array.from(document.querySelectorAll("[aria-label],button"))
      .map(textOf)
      .find((text) => /pro|plus|team|free|계정|account/i.test(text)) || "";
    return {
      url: location.href,
      title: document.title,
      phase,
      composerFound,
      imageToolFound,
      accountLabel,
      buttons,
      pageText,
    };
  });
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  const report = {
    ok: true,
    provider: "chatgpt-diagnostics",
    screenshotPath,
    ...snapshot,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  return { ...report, reportPath };
}
```

- [ ] **Step 3: Call diagnostics when the composer is missing**

In `C:\Users\amd\hermes\automation\chatgpt-thumbnail-source.mjs`, inside the existing `findComposer(page)` catch block, call diagnostics before writing the auth/access failure result:

```js
const diagnostics = await diagnoseChatGptThumbnailState({
  page,
  outputDir,
  phase: "composer-search",
});
const screenshotPath = diagnostics.screenshotPath || join(outputDir, "chatgpt-thumbnail-auth-or-access-failure.png");
```

Persist `diagnostics.reportPath` in `chatgpt-thumbnail-result.json`:

```js
details: {
  diagnosticsPath: diagnostics.reportPath,
}
```

- [ ] **Step 4: Call diagnostics on image-tool failures**

In `C:\Users\amd\hermes\automation\chatgpt-thumbnail-source.mjs`, after `clickImageCreationTool`:

```js
const toolState = await clickImageCreationTool(page, outputDir);
if (!toolState.ok) {
  const diagnostics = await diagnoseChatGptThumbnailState({
    page,
    outputDir,
    phase: "image-tool-selection",
  });
  await persistThumbnailFailure({
    outputDir,
    code: "CHATGPT_IMAGE_TOOL_NOT_FOUND",
    reason: "chatgpt-image-tool-not-found",
    message: "ChatGPT loaded, but Hermes could not find or select the image creation tool.",
    screenshotPath: diagnostics.screenshotPath,
    details: { toolState, diagnosticsPath: diagnostics.reportPath },
  });
  throw createChatGptThumbnailError("CHATGPT_IMAGE_TOOL_NOT_FOUND", "ChatGPT image creation tool was not found.", { diagnosticsPath: diagnostics.reportPath });
}
```

- [ ] **Step 5: Add package check and verify**

Modify `C:\Users\amd\hermes\package.json`:

```json
"check:chatgpt-thumbnail": "node scripts/check-chatgpt-thumbnail-pipeline.mjs && node scripts/check-chatgpt-thumbnail-failure-taxonomy.mjs && node scripts/check-chatgpt-thumbnail-diagnostics-contract.mjs"
```

Run:

```powershell
npm.cmd run check:chatgpt-thumbnail
```

Expected: PASS.

---

### Task 3: Add Optional Webwright Diagnostics Service

**Files:**

- Create: `C:\Users\amd\hermes\electron\services\webwright-diagnostics-service.mjs`
- Modify: `C:\Users\amd\hermes\electron\services\config-store.mjs`
- Modify: `C:\Users\amd\hermes\electron\main.mjs`
- Modify: `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`
- Modify: `C:\Users\amd\hermes\workflow-db-events.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-webwright-diagnostics-contract.mjs`
- Modify: `C:\Users\amd\hermes\package.json`

- [ ] **Step 1: Write contract**

Create `C:\Users\amd\hermes\scripts\check-webwright-diagnostics-contract.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const service = readFileSync(resolve(root, "electron/services/webwright-diagnostics-service.mjs"), "utf8");
const config = readFileSync(resolve(root, "electron/services/config-store.mjs"), "utf8");
const main = readFileSync(resolve(root, "electron/main.mjs"), "utf8");
const jobService = readFileSync(resolve(root, "electron/services/youtube-job-service.mjs"), "utf8");
const workflowDbEvents = readFileSync(resolve(root, "workflow-db-events.mjs"), "utf8");

assert.match(service, /export async function maybeRunWebwrightDiagnostics/, "service must export maybeRunWebwrightDiagnostics");
assert.match(service, /webwrightDiagnosticsEnabled/, "service must be feature-flagged");
assert.match(service, /diagnostics-webwright/, "service must write under diagnostics-webwright folder");
assert.match(service, /spawn\(/, "service must shell out asynchronously only when enabled and installed");
assert.doesNotMatch(service, /spawnSync/, "service must not block the Electron main process with spawnSync");
assert.match(service, /WEBWRIGHT_NOT_INSTALLED/, "service must handle missing Webwright");
assert.match(config, /webwrightDiagnosticsEnabled:\s*false/, "config default must keep Webwright disabled");
assert.match(main, /createYouTubeJob[\s\S]*config,/, "main process must pass full config into createYouTubeJob context");
assert.match(jobService, /maybeRunWebwrightDiagnostics/, "job service must call diagnostics on browser failures");
assert.match(workflowDbEvents, /CHATGPT_/, "workflow DB mirror must persist ChatGPT primary provider failures");
assert.match(workflowDbEvents, /primaryProviderFailure/, "workflow DB mirror must detect thumbnail primary provider failures");

console.log(JSON.stringify({ ok: true, checked: "webwright-diagnostics-contract" }));
```

- [ ] **Step 2: Add config default**

In `C:\Users\amd\hermes\electron\services\config-store.mjs`, add:

```js
webwrightDiagnosticsEnabled: false,
webwrightCommand: "webwright",
```

- [ ] **Step 3: Create the Webwright diagnostics service**

Create `C:\Users\amd\hermes\electron\services\webwright-diagnostics-service.mjs`:

```js
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BROWSER_FAILURE_CODES = new Set([
  "CHATGPT_AUTH_REQUIRED",
  "CHATGPT_HUMAN_VERIFICATION_REQUIRED",
  "CHATGPT_COMPOSER_NOT_FOUND",
  "CHATGPT_IMAGE_TOOL_NOT_FOUND",
  "CHATGPT_TEXT_RESPONSE_INSTEAD_OF_IMAGE",
  "CHATGPT_IMAGE_TIMEOUT",
  "FLOW_MODE_MISMATCH",
  "FLOW_MEDIA_URL_NOT_FOUND",
  "GEMINI_RESPONSE_TIMEOUT",
]);

function runCommand(command, args = [], { timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ status: 124, stdout, stderr: `${stderr}\nProcess timed out after ${timeoutMs}ms`.trim() });
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: 1, stdout, stderr: String(error?.message || error) });
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status: status ?? 1, stdout, stderr });
    });
  });
}

export async function maybeRunWebwrightDiagnostics({ config = {}, jobDir, provider, failure = {}, sourceUrl = "" }) {
  if (!config.webwrightDiagnosticsEnabled) {
    return { ok: false, skipped: true, reason: "webwright-diagnostics-disabled" };
  }
  const code = failure.code || failure.failureCode || "";
  if (!BROWSER_FAILURE_CODES.has(code)) {
    return { ok: false, skipped: true, reason: "failure-code-not-browser-diagnostic", code };
  }
  const outDir = join(jobDir, "diagnostics-webwright");
  mkdirSync(outDir, { recursive: true });
  const taskPath = join(outDir, "task.md");
  const reportPath = join(outDir, "webwright-diagnostics-result.json");
  const task = [
    `Provider: ${provider}`,
    `Failure code: ${code}`,
    `Source URL: ${sourceUrl || ""}`,
    "",
    "Inspect the authenticated browser workflow failure.",
    "Do not submit forms or create paid resources.",
    "Capture screenshots, DOM summaries, and a reusable Playwright script suggestion.",
  ].join("\n");
  writeFileSync(taskPath, task, "utf8");

  const command = config.webwrightCommand || "webwright";
  const probe = await runCommand(command, ["--help"], { timeoutMs: 15000 });
  if (probe.status !== 0) {
    const result = {
      ok: false,
      code: "WEBWRIGHT_NOT_INSTALLED",
      message: "Webwright command is not available. Install microsoft/Webwright or keep diagnostics disabled.",
      taskPath,
      stdout: probe.stdout || "",
      stderr: probe.stderr || "",
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(reportPath, JSON.stringify(result, null, 2), "utf8");
    return { ...result, reportPath };
  }

  const result = {
    ok: false,
    code: "WEBWRIGHT_MANUAL_RUN_REQUIRED",
    message: "Webwright is installed. Hermes prepared a task file; run it manually until a safe non-interactive profile integration is added.",
    taskPath,
    suggestedCommand: `${command} run "${taskPath}"`,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(reportPath, JSON.stringify(result, null, 2), "utf8");
  return { ...result, reportPath };
}
```

Important: this first implementation must not auto-run Webwright against logged-in ChatGPT/Google sessions. It only prepares a reproducible diagnostic task and detects whether Webwright exists. Full automation comes after security review.

- [ ] **Step 4: Pass full config into the YouTube job context**

In `C:\Users\amd\hermes\electron\main.mjs`, update the existing `createYouTubeJob` call in the `youtube:createJob` IPC handler. The current code passes only `chromePath: config.chromePath`; Webwright diagnostics needs the feature flag and command:

```js
const result = await createYouTubeJob(inputWithId, {
  paths,
  emit: sendJobEvent,
  outputDir: OUTPUT_DIR,
  jobDir: activeJobDir,
  ffmpegBin: FFMPEG_BIN,
  chromePath: config.chromePath,
  config,
});
```

- [ ] **Step 5: Trigger diagnostics after thumbnail failures**

In `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`, after thumbnail generation:

```js
if (thumbnail?.primaryProviderFailure) {
  const diagnostics = await maybeRunWebwrightDiagnostics({
    config: context.config || {},
    jobDir,
    provider: "chatgpt-thumbnail",
    failure: thumbnail.primaryProviderFailure,
    sourceUrl: job.sourceType === "url" ? job.sourceValue : "",
  });
  emitProgress?.({
    phase: "diagnostics",
    message: diagnostics.skipped
      ? "브라우저 진단은 비활성화되어 건너뜁니다."
      : `브라우저 진단 리포트가 생성되었습니다: ${diagnostics.reportPath}`,
    details: diagnostics,
  });
}
```

- [ ] **Step 6: Persist ChatGPT primary-provider failures to SQLite**

In `C:\Users\amd\hermes\workflow-db-events.mjs`, extend `isFailureEvent`, `failureCodeOf`, and `failureCodesOf` so a completed job with local thumbnail fallback still records the ChatGPT primary-provider failure.

Add to `isFailureEvent(event)`:

```js
|| String(event.details?.failureCode || "").startsWith("CHATGPT_")
|| String(event.details?.primaryProviderFailure?.code || event.details?.primaryProviderFailure?.failureCode || "").startsWith("CHATGPT_")
```

Add to `failureCodeOf(event)` before text fallback:

```js
const primaryProviderFailureCode = event.details?.primaryProviderFailure?.code
  || event.details?.primaryProviderFailure?.failureCode
  || "";
if (String(primaryProviderFailureCode).startsWith("CHATGPT_")) {
  return String(primaryProviderFailureCode);
}
```

Add to `failureCodesOf(event)`:

```js
if (event.details?.primaryProviderFailure?.code) codes.push(event.details.primaryProviderFailure.code);
if (event.details?.primaryProviderFailure?.failureCode) codes.push(event.details.primaryProviderFailure.failureCode);
```

Do not add or reference `triageDiagnostic` in `bot_db_helper.py`; it does not exist in the current codebase.

- [ ] **Step 7: Verify**

Run:

```powershell
node C:\Users\amd\hermes\scripts\check-webwright-diagnostics-contract.mjs
npm.cmd run check
```

Expected: both PASS.

---

### Task 4: Add Studio UI Feedback for ChatGPT Thumbnail Failure

**Files:**

- Modify: `C:\Users\amd\hermes\electron\renderer\app.js`
- Modify: `C:\Users\amd\hermes\electron\renderer\index.html`
- Modify: `C:\Users\amd\hermes\electron\services\job-progress-events.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-studio-v2-ux.mjs`

- [ ] **Step 1: Extend UX contract**

In `C:\Users\amd\hermes\scripts\check-studio-v2-ux.mjs`, assert:

```js
assert.match(renderer, /primaryProviderFailure/, "Studio should expose primary provider thumbnail failures");
assert.match(renderer, /CHATGPT_IMAGE_TOOL_NOT_FOUND/, "Studio should explain ChatGPT image tool failures");
assert.match(html, /webwrightDiagnosticsEnabled|Webwright/, "Studio should expose optional Webwright diagnostics status");
```

- [ ] **Step 2: Show clear console messages**

In `C:\Users\amd\hermes\electron\renderer\app.js`, add:

```js
function explainThumbnailFailure(failure = {}) {
  const code = failure.code || failure.failureCode || "";
  if (code === "CHATGPT_IMAGE_TOOL_NOT_FOUND") {
    return "ChatGPT는 열렸지만 이미지 만들기 도구를 찾지 못했습니다. ChatGPT 화면에서 이미지 생성 기능이 사용 가능한 계정/모델인지 확인하세요.";
  }
  if (code === "CHATGPT_HUMAN_VERIFICATION_REQUIRED") {
    return "ChatGPT 사람 확인 또는 보안 확인이 필요합니다. Authenticate ChatGPT를 열고 확인을 완료한 뒤 다시 실행하세요.";
  }
  if (code === "CHATGPT_AUTH_REQUIRED") {
    return "ChatGPT 로그인이 필요합니다. Authenticate ChatGPT 버튼으로 로그인하세요.";
  }
  if (code === "CHATGPT_IMAGE_TIMEOUT") {
    return "ChatGPT가 제한 시간 안에 새 썸네일 이미지를 노출하지 않았습니다. 모델/도구 상태를 확인하세요.";
  }
  return failure.message || "ChatGPT 썸네일 생성 실패로 로컬 폴백 썸네일을 사용했습니다.";
}
```

When artifact details include `primaryProviderFailure`, log:

```js
appendConsoleLine({
  level: "warning",
  message: explainThumbnailFailure(details.primaryProviderFailure),
  details: details.primaryProviderFailure,
});
```

- [ ] **Step 3: Add optional Webwright diagnostics status**

In `C:\Users\amd\hermes\electron\renderer\index.html`, add a small diagnostics row near Authentication/Console:

```html
<label class="checkbox-line">
  <input id="webwrightDiagnosticsEnabled" type="checkbox">
  Webwright 진단 리포트 생성
</label>
```

Wire it into config persistence only if config-store already exposes settings save. If no settings save path exists, leave it read-only in the first implementation and document manual config editing.

- [ ] **Step 4: Verify**

Run:

```powershell
node C:\Users\amd\hermes\scripts\check-studio-v2-ux.mjs
npm.cmd run check:desktop-progress
```

Expected: PASS.

---

### Task 5: Add Webwright Manual and Installation Notes

**Files:**

- Create: `C:\Users\amd\hermes\docs\manuals\webwright-diagnostics-manual.md`
- Modify: `C:\Users\amd\hermes\timeline.md`

- [ ] **Step 1: Create manual**

Create `C:\Users\amd\hermes\docs\manuals\webwright-diagnostics-manual.md`:

```md
# Webwright Diagnostics Manual

Hermes Studio uses Playwright as the production browser automation engine. Webwright is optional and disabled by default.

## Why Webwright Is Optional

Webwright is useful for browser automation diagnosis because it creates reusable scripts, logs, and screenshots. It should not replace the existing Hermes Flow/Gemini/ChatGPT automation until the generated scripts are reviewed and validated.

## Install

```powershell
cd C:\Users\amd
git clone https://github.com/microsoft/Webwright.git
cd C:\Users\amd\Webwright
python -m pip install -e .
python -m playwright install chromium
```

## Enable in Hermes

Set:

```json
{
  "webwrightDiagnosticsEnabled": true,
  "webwrightCommand": "webwright"
}
```

## Output

Each failed job may contain:

- `diagnostics-webwright\task.md`
- `diagnostics-webwright\webwright-diagnostics-result.json`
- `chatgpt-thumbnail-diagnostics.json`
- `chatgpt-thumbnail-diagnostics.png`
- `chatgpt-thumbnail-tool-menu.png`

## Operator Rule

If the failure code is `CHATGPT_HUMAN_VERIFICATION_REQUIRED`, complete Authenticate ChatGPT manually first. Webwright must not bypass human verification.

Before running a manual Webwright diagnostic against any authenticated browser profile, close Hermes Studio browser automation windows and confirm no job is currently running. Do not point Webwright at `chatgptProfileDir`, `geminiProfileDir`, or `flowProfileDir` while Hermes is actively using that profile.
```

- [ ] **Step 2: Update timeline**

Add to `C:\Users\amd\hermes\timeline.md`:

```md
## 2026-05-31

- Planned Webwright as an optional browser diagnostics/crafting layer, not a replacement for Hermes' Playwright production executor.
- Planned ChatGPT thumbnail failure taxonomy and diagnostics artifacts so local thumbnail fallback no longer hides primary-provider failure.
- Reviewed `HERMES_WEBWRIGHT_DIAGNOSTICS_REVIEW.md`; accepted config propagation, non-blocking Webwright command checks, SQLite ChatGPT failure persistence, composer-stage diagnostics, and manual profile-concurrency warnings. Rejected the `bot_db_helper.py triageDiagnostic` recommendation because that function does not exist in the current codebase.
```

---

### Task 6: Final Verification and Packaging

**Files:**

- Verify only.

- [ ] **Step 1: Run targeted checks**

Run:

```powershell
npm.cmd run check:chatgpt-thumbnail
node C:\Users\amd\hermes\scripts\check-webwright-diagnostics-contract.mjs
node C:\Users\amd\hermes\scripts\check-studio-v2-ux.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run full checks**

Run:

```powershell
npm.cmd run check
```

Expected: PASS.

- [ ] **Step 3: Package**

Run:

```powershell
$procs = Get-Process | Where-Object { $_.ProcessName -like '*Hermes*' -or $_.ProcessName -eq 'electron' }
foreach ($p in $procs) {
  try {
    if ($p.Path -like 'C:\Users\amd\hermes\*' -or $p.ProcessName -like '*Hermes*') {
      Stop-Process -Id $p.Id -Force
    }
  } catch {}
}
npm.cmd run electron:pack
```

Expected:

- `C:\Users\amd\hermes\dist-electron\win-unpacked\Hermes YouTube Studio.exe`
- `C:\Users\amd\hermes\dist-electron\Hermes YouTube Studio Setup 1.0.0.exe`

- [ ] **Step 4: Verify package contents**

Run:

```powershell
@'
const asar = require('@electron/asar');
const app = 'C:/Users/amd/hermes/dist-electron/win-unpacked/resources/app.asar';
const read = (p) => asar.extractFile(app, p).toString();
const service = read('electron\\services\\webwright-diagnostics-service.mjs');
const thumbnail = read('automation\\chatgpt-thumbnail-source.mjs');
console.log(JSON.stringify({
  webwrightDiagnostics: service.includes('maybeRunWebwrightDiagnostics'),
  chatgptImageToolFailure: thumbnail.includes('CHATGPT_IMAGE_TOOL_NOT_FOUND'),
  chatgptDiagnostics: thumbnail.includes('chatgpt-thumbnail-diagnostics')
}, null, 2));
'@ | node -
```

Expected:

```json
{
  "webwrightDiagnostics": true,
  "chatgptImageToolFailure": true,
  "chatgptDiagnostics": true
}
```

---

## Rollout Policy

- Default mode: Webwright diagnostics disabled.
- Safe production path: current Hermes Playwright automation remains the only executor.
- Diagnostic mode: Webwright prepares task files and reports. It does not automatically drive logged-in ChatGPT/Google sessions in phase 1.
- Rollback: set `webwrightDiagnosticsEnabled` to `false`; no workflow behavior changes.

## Security Policy

- Never log cookies, bearer tokens, refresh tokens, or authorization headers.
- Redact keys named `cookie`, `token`, `authorization`, `session`.
- Do not bypass CAPTCHA or human verification.
- Do not run Webwright against authenticated profiles until a user-visible diagnostic consent toggle exists.
- Do not delete browser profiles automatically as a recovery step. Offer account-change/clear-session actions through the existing Authentication UI.

## Reviewer Notes Incorporated

The GPT-5.3 Codex read-only reviewer identified these risks, all reflected above:

- Existing ChatGPT automation is brittle because it relies on UI labels and some text patterns are encoding-damaged.
- The thumbnail fallback path currently makes the job look successful even when ChatGPT failed.
- Profile-lock and auth-window concurrency can corrupt sessions if one process kills another at the wrong time.
- Webwright should be a diagnostics/crafting layer, not a second production browser executor.
- Webwright must be feature-flagged, with rollback and security controls before touching logged-in sessions.

The external review file `C:\Users\amd\hermes\HERMES_WEBWRIGHT_DIAGNOSTICS_REVIEW.md` was also checked against the current codebase. These items were accepted:

- `electron/main.mjs` currently passes `chromePath` but not the full `config` object into `createYouTubeJob`, so the diagnostics feature flag would be unavailable without an explicit `config` pass-through.
- The planned Webwright command check must not use `spawnSync` in the Electron main process. The plan now uses async `spawn()` with a timeout.
- `workflow-db-events.mjs` currently recognizes many failure shapes but not `primaryProviderFailure` or `CHATGPT_` prefix failures, so ChatGPT thumbnail failures hidden behind local fallback need explicit DB mirroring.
- Composer-stage failures need the same diagnostic probe as image-tool failures, because login/Cloudflare/blank access gates often fail before the image menu exists.
- The manual must warn against running Webwright against an authenticated profile while Hermes is actively using that profile.

This item was rejected:

- `bot_db_helper.py triageDiagnostic` changes. The current `bot_db_helper.py` contains failure logging and reporting helpers, but no `triageDiagnostic` function. Adding a plan step for a nonexistent function would be misleading; the valid observability fix belongs in `workflow-db-events.mjs`.

## Self-Review

- Spec coverage: Webwright research, Hermes usage direction, ChatGPT thumbnail failure recovery, 5.3 reviewer feedback, external review validation, DB persistence, testing, rollout, and packaging are covered.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: failure codes use `failure.code`/`failure.failureCode`, artifacts use existing job directory conventions, config is passed as `context.config`, and the plan keeps Hermes' existing `local-composited` fallback.
