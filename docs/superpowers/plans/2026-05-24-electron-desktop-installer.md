# Hermes Electron Desktop Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package Hermes as an installable Electron desktop app that can run on another Windows computer and generate YouTube Shorts either from Telegram commands or directly inside the app with keyword/URL input, selectable script length, selectable TTS voice, selectable subtitle style, Google Flow automation, Supertonic TTS, final video rendering, hook-driven ChatGPT-authenticated thumbnail generation, and guarded YouTube auto-upload.

**Architecture:** Split the current Telegram-bound workflow into a reusable YouTube job engine. Electron submits structured `YouTubeJobRequest` objects through IPC, Telegram submits the same request schema through an adapter, and both paths use the same Google Flow, Supertonic TTS, subtitle, thumbnail, ffmpeg render, review, and upload pipeline. YouTube upload/OAuth and thumbnail post-processing are implemented in Node.js so the installer does not need Python for upload/thumbnail features; Python remains external only for the existing Supertonic TTS runtime. The desktop app becomes the primary production studio; Telegram remains an optional remote-control surface.

**Tech Stack:** Electron, electron-builder, Node.js/Electron main-process services, existing Hermes `.mjs` scripts, SQLite `bot_data.db`, Chrome/Google Flow CDP profile, Chrome/ChatGPT profile, Supertonic local TTS, `ffmpeg-static`, `googleapis`, `sharp`, Playwright, PowerShell installer helpers.

---

## Scope And Reality Check

This can become installable, but "install and immediately use with no setup" is not fully possible because Google Flow login, OpenRouter key, and possibly Supertonic model files are user-specific credentials/assets. Telegram credentials are optional because the app must also work without Telegram. The installer can make the setup guided and mostly automatic:

- Install the Electron app and bundled Node dependencies.
- Create an app data directory outside the source tree.
- Let the user paste OpenRouter credentials and optional Telegram credentials.
- Detect or install/copy Supertonic TTS.
- Launch Chrome profile for one-time Google Flow login.
- Start/stop the optional Telegram worker from the UI.
- Create video jobs directly inside the app from a keyword or URL.
- Choose script length, voice, speech speed, subtitle style, character profile, render ratio, and output quality before generation.
- Render final videos and show/send only the final mp4.
- Optionally generate title/description/tags and a hook-driven thumbnail from the title/script context, then upload after explicit user approval.
- Keep upload state durable so a restarted app never double-uploads or loses an awaiting-approval job.

## Target User Flow

1. User installs `Hermes Setup.exe`.
2. User opens Hermes Desktop.
3. Setup wizard checks:
   - optional Telegram bot token
   - optional allowed Telegram user/chat id
   - OpenRouter key
   - Chrome availability
   - Google Flow login profile
   - optional ChatGPT login profile for thumbnail generation
   - Supertonic TTS path
   - ffmpeg availability through `ffmpeg-static`
4. User opens the `Create` screen.
5. User selects source mode:
   - `Keyword`: enter a topic such as `최신 AI 뉴스`.
   - `URL`: paste a news/article/video URL to summarize and adapt.
6. User chooses:
   - script length: 30s, 45s, 60s, 90s, or custom scene count.
   - TTS voice: installed Supertonic voice preset such as `M1`, `F1`, or custom voice id.
   - speech speed: normal, fast shorts, or custom numeric speed.
   - subtitle style: clean news, bold shorts, minimal, or custom.
   - character profile: no person, consistent presenter, or saved character preset.
7. User clicks `Generate Final Video`.
8. Hermes creates the script, scene prompts, Flow videos/images, TTS, subtitles, and final rendered mp4.
9. Hermes creates upload metadata and a hook-driven thumbnail prompt from the title, script, key contradiction, emotional beat, and strongest curiosity gap.
10. The app displays job status, logs, output folder, preview, latest final video, metadata, and thumbnail.
11. User reviews the final video and clicks `Approve Upload`.
12. Hermes uploads the video through the YouTube Data API with resumable upload, attaches the thumbnail, and stores the returned video id.
13. If Telegram is configured, user can also click `Start Telegram Worker` and send remote requests. Telegram receives only the final mp4 unless the user explicitly enables debug attachments.

## File Structure

- Create: `electron/main.mjs`
  - Owns Electron app lifecycle, window creation, IPC registration, worker process management.
- Create: `electron/preload.mjs`
  - Exposes safe IPC API to renderer.
- Create: `electron/renderer/index.html`
  - Desktop UI shell.
- Create: `electron/renderer/app.js`
  - UI state, setup wizard, process controls, logs.
- Create: `electron/renderer/styles.css`
  - Desktop UI styling.
- Create: `electron/services/config-store.mjs`
  - Reads/writes config under `%APPDATA%/Hermes/config.json`.
- Create: `electron/services/health-check.mjs`
  - Checks required binaries, credentials, TTS path, Chrome, Flow profile, script syntax.
- Create: `electron/services/worker-manager.mjs`
  - Starts/stops `telegram-flow-news-bot.mjs --watch`, captures stdout/stderr, tracks PID.
- Create: `electron/services/youtube-job-service.mjs`
  - Accepts app-native job requests, runs the reusable YouTube job engine, streams status events to the renderer.
- Create: `electron/services/job-store.mjs`
  - Persists job history, options, status, output paths, failures, and final mp4 metadata under `%APPDATA%/Hermes/jobs`.
- Create: `electron/services/youtube-upload-service.mjs`
  - Runs native Node.js YouTube OAuth/upload, tracks approval/upload state, streams progress.
- Create: `electron/services/path-resolver.mjs`
  - Resolves app resources in dev vs packaged mode.
- Create: `youtube-job-schema.mjs`
  - Defines `YouTubeJobRequest`, default presets, validation, and Telegram/app normalization.
- Create: `youtube-job-runner.mjs`
  - Reusable orchestration layer called by both Electron and Telegram.
- Create: `scripts/check-electron-config.mjs`
  - Smoke test for Electron config and health-check modules without opening a UI.
- Create: `scripts/check-youtube-job-schema.mjs`
  - Verifies job options, presets, and source-mode validation.
- Create: `scripts/check-render-options.mjs`
  - Verifies subtitle and voice render options flow into TTS and ffmpeg scripts.
- Create: `pipeline/youtube-auth.mjs`
  - Owns Google OAuth, credential loading, refresh, and local browser/manual auth helpers using `googleapis`.
- Create: `pipeline/youtube-upload.mjs`
  - Uploads mp4 files with resumable upload, sanitized metadata, AI synthetic-media disclosure, privacy settings, and thumbnail binding using Node.js streams.
- Create: `pipeline/youtube-thumbnail.mjs`
  - Produces final 1280x720 thumbnail output. Primary path uses an authenticated ChatGPT browser profile and keystroke-style image creation; fallback path extracts a strong video frame with ffmpeg and renders readable text with `sharp`.
- Create: `pipeline/youtube-thumbnail-prompt.mjs`
  - Converts title, script, scene metadata, and target audience into a hook headline, visual concept, negative prompt, and ChatGPT image prompt.
- Create: `automation/chatgpt-thumbnail-source.mjs`
  - Opens ChatGPT with the user's authenticated browser profile, types the thumbnail prompt into the chat box, clicks `+`, clicks `이미지 만들기`, waits for image generation, and downloads the image source.
- Create: `pipeline/youtube-meta.mjs`
  - Generates and sanitizes title, description, tags, category, privacy, and disclosure metadata.
- Create: `pipeline/youtube-review-flow.mjs`
  - Runs pre-upload guards, classifies errors, controls retry policy, and enforces user approval state.
- Create: `scripts/check-youtube-upload-pipeline.mjs`
  - Static and CLI smoke tests for OAuth, upload, thumbnail, metadata, and review modules.
- Modify: `package.json`
  - Add Electron dependencies, app entry, build scripts, packaging config.
- Modify: `telegram-flow-news-bot.mjs`
  - Read config paths from env variables so packaged app does not depend on `C:/Users/amd/hermes`.
  - Convert Telegram messages into `YouTubeJobRequest` and call `youtube-job-runner.mjs`.
- Modify: `scripts/render-youtube-with-tts.mjs`
  - Read TTS root, output root, subtitle style, render ratio, and quality from env variables or render-options JSON.
- Modify: `scripts/make-scenes-tts.py`
  - Read `HERMES_TTS_ROOT`, voice id, voice style, language, and speech speed from env variables or render-options JSON.
- Modify: `scripts/check-youtube-workflow.mjs`
  - Add assertions that hard-coded local paths can be overridden.

---

## Task 1: Add Runtime Path Configuration

**Files:**
- Modify: `telegram-flow-news-bot.mjs`
- Modify: `scripts/render-youtube-with-tts.mjs`
- Modify: `scripts/make-scenes-tts.py`
- Modify: `scripts/check-youtube-workflow.mjs`

- [ ] **Step 1: Write failing test for env-overridable paths**

Add to `scripts/check-youtube-workflow.mjs`:

```js
assert.match(botSource, /process\.env\.HERMES_ROOT/, "Bot should support HERMES_ROOT for packaged installs");
assert.match(botSource, /process\.env\.HERMES_OUTPUT_DIR/, "Bot should support HERMES_OUTPUT_DIR for packaged installs");

const rendererSource = await import("node:fs").then((fs) => fs.readFileSync(resolve(root, "scripts/render-youtube-with-tts.mjs"), "utf8"));
assert.match(rendererSource, /process\.env\.HERMES_TTS_ROOT/, "Renderer should support HERMES_TTS_ROOT");
assert.match(rendererSource, /process\.env\.HERMES_OUTPUT_DIR/, "Renderer should support HERMES_OUTPUT_DIR");

const ttsSource = await import("node:fs").then((fs) => fs.readFileSync(resolve(root, "scripts/make-scenes-tts.py"), "utf8"));
assert.match(ttsSource, /HERMES_TTS_ROOT/, "TTS script should read HERMES_TTS_ROOT");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scripts\check-youtube-workflow.mjs
```

Expected: FAIL mentioning missing `HERMES_ROOT`, `HERMES_OUTPUT_DIR`, or `HERMES_TTS_ROOT`.

- [ ] **Step 3: Implement env path overrides**

In `telegram-flow-news-bot.mjs`, replace top-level constants with:

```js
const ROOT = process.env.HERMES_ROOT || "C:/Users/amd/hermes";
const OUTPUT_DIR = process.env.HERMES_OUTPUT_DIR || `${ROOT}/outputs`;
const LOCAL_CONFIG = process.env.HERMES_CONFIG_FILE || `${ROOT}/telegram-flow-news-config.json`;
const OFFSET_FILE = process.env.HERMES_OFFSET_FILE || `${ROOT}/telegram-flow-offset.json`;
const STATE_FILE = process.env.HERMES_STATE_FILE || `${ROOT}/telegram-flow-state.json`;
const TASK_LOG_FILE = process.env.HERMES_TASK_LOG_FILE || `${OUTPUT_DIR}/telegram-task-events.jsonl`;
const DB_HELPER = process.env.HERMES_DB_HELPER || `${ROOT}/bot_db_helper.py`;
const OPENROUTER_KEY_FILE = process.env.HERMES_OPENROUTER_KEY_FILE || `${ROOT}/openrouter.txt.txt`;
const PROFILE_DIR = process.env.HERMES_FLOW_PROFILE_DIR || `${ROOT}/.aistudio-browser-profile`;
```

In `scripts/render-youtube-with-tts.mjs`, use:

```js
const ROOT = process.env.HERMES_ROOT || "C:/Users/amd/hermes";
const OUTPUT_ROOT = process.env.HERMES_OUTPUT_DIR || `${ROOT}/outputs`;
const TTS_ROOT = process.env.HERMES_TTS_ROOT || "C:/Users/amd/supertonic3-local-tts-20260517-r4/supertonic3-local-tts";
```

In `scripts/make-scenes-tts.py`, use:

```python
import os
TTS_ROOT = Path(os.environ.get("HERMES_TTS_ROOT", "C:/Users/amd/supertonic3-local-tts-20260517-r4/supertonic3-local-tts"))
```

- [ ] **Step 4: Run tests**

Run:

```powershell
node .\scripts\check-youtube-workflow.mjs
npm.cmd run check
```

Expected: both pass.

---

## Task 2: Create Electron App Shell

**Files:**
- Create: `electron/main.mjs`
- Create: `electron/preload.mjs`
- Create: `electron/renderer/index.html`
- Create: `electron/renderer/app.js`
- Create: `electron/renderer/styles.css`
- Modify: `package.json`

- [ ] **Step 1: Add package scripts and dependencies**

Run:

```powershell
npm.cmd install --save-dev electron electron-builder
```

Modify `package.json`:

```json
{
  "main": "electron/main.mjs",
  "scripts": {
    "electron:dev": "electron .",
    "electron:pack": "electron-builder --win nsis",
    "check": "node --check ./telegram-flow-news-bot.mjs && node --check ./electron/main.mjs && node --check ./electron/preload.mjs && node ./scripts/check-electron-config.mjs && node ./scripts/check-mojibake.mjs && node ./scripts/check-secrets.mjs && node ./scripts/check-routing-cases.mjs && node ./scripts/check-youtube-workflow.mjs && python ./bot_db_helper.py init && node ./scripts/check-embeddings.mjs && node ./scripts/check-memory-context.mjs && node ./scripts/check-control-commands-not-memory.mjs && node ./scripts/check-auto-failure-report.mjs && node ./scripts/check-strategy-gate.mjs && node ./scripts/check-workflow-labels.mjs && node ./scripts/check-openrouter-override.mjs && node ./scripts/check-telegram-long-message.mjs && node ./scripts/check-option-choice-context.mjs && node ./scripts/check-continuation-context.mjs && node ./scripts/check-bybit-integration.mjs && node ./scripts/check-codex-cli-timeout.mjs && node ./telegram-flow-news-bot.mjs --test-watchdog-retry"
  },
  "build": {
    "appId": "local.hermes.desktop",
    "productName": "Hermes",
    "directories": {
      "output": "dist-electron"
    },
    "files": [
      "electron/**/*",
      "telegram-flow-news-bot.mjs",
      "youtube-workflow.mjs",
      "bot_db_helper.py",
      "scripts/**/*",
      "package.json",
      "node_modules/**/*"
    ],
    "win": {
      "target": "nsis"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    }
  }
}
```

- [ ] **Step 2: Create `electron/main.mjs`**

```js
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig, writeConfig } from "./services/config-store.mjs";
import { runHealthCheck } from "./services/health-check.mjs";
import { createWorkerManager } from "./services/worker-manager.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
let win;
let worker;

function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(join(__dirname, "renderer/index.html"));
}

app.whenReady().then(() => {
  worker = createWorkerManager((event) => {
    win?.webContents.send("worker:event", event);
  });
  createWindow();
});

app.on("window-all-closed", () => {
  worker?.stop();
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("config:read", () => readConfig());
ipcMain.handle("config:write", (_event, patch) => writeConfig(patch));
ipcMain.handle("health:run", () => runHealthCheck());
ipcMain.handle("worker:start", async () => worker.start(await readConfig()));
ipcMain.handle("worker:stop", () => worker.stop());
ipcMain.handle("worker:status", () => worker.status());
ipcMain.handle("shell:openPath", (_event, path) => shell.openPath(path));
```

- [ ] **Step 3: Create `electron/preload.mjs`**

```js
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("hermes", {
  readConfig: () => ipcRenderer.invoke("config:read"),
  writeConfig: (patch) => ipcRenderer.invoke("config:write", patch),
  runHealthCheck: () => ipcRenderer.invoke("health:run"),
  startWorker: () => ipcRenderer.invoke("worker:start"),
  stopWorker: () => ipcRenderer.invoke("worker:stop"),
  workerStatus: () => ipcRenderer.invoke("worker:status"),
  openPath: (path) => ipcRenderer.invoke("shell:openPath", path),
  onWorkerEvent: (handler) => ipcRenderer.on("worker:event", (_event, payload) => handler(payload)),
});
```

- [ ] **Step 4: Create minimal renderer files**

Create `electron/renderer/index.html`:

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Hermes</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <main>
    <section class="toolbar">
      <h1>Hermes</h1>
      <button id="health">Health Check</button>
      <button id="start">Start Worker</button>
      <button id="stop">Stop Worker</button>
    </section>
    <section class="grid">
      <form id="settings">
        <label>Telegram Bot Token <input name="telegramBotToken" type="password" /></label>
        <label>Allowed Chat/User ID <input name="allowFrom" /></label>
        <label>OpenRouter API Key <input name="openRouterKey" type="password" /></label>
        <label>Supertonic TTS Root <input name="ttsRoot" /></label>
        <label>Output Directory <input name="outputDir" /></label>
        <button type="submit">Save Settings</button>
      </form>
      <pre id="status"></pre>
    </section>
  </main>
  <script src="./app.js"></script>
</body>
</html>
```

Create `electron/renderer/app.js`:

```js
const statusEl = document.querySelector("#status");
const settings = document.querySelector("#settings");

function show(value) {
  statusEl.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

async function load() {
  const config = await window.hermes.readConfig();
  for (const [key, value] of Object.entries(config)) {
    const input = settings.elements[key];
    if (input) input.value = value || "";
  }
  show(await window.hermes.workerStatus());
}

settings.addEventListener("submit", async (event) => {
  event.preventDefault();
  const patch = Object.fromEntries(new FormData(settings).entries());
  show(await window.hermes.writeConfig(patch));
});

document.querySelector("#health").addEventListener("click", async () => show(await window.hermes.runHealthCheck()));
document.querySelector("#start").addEventListener("click", async () => show(await window.hermes.startWorker()));
document.querySelector("#stop").addEventListener("click", async () => show(await window.hermes.stopWorker()));
window.hermes.onWorkerEvent((event) => show(event));

load().catch((error) => show(error.stack || error.message));
```

Create `electron/renderer/styles.css`:

```css
body {
  margin: 0;
  font-family: Segoe UI, Arial, sans-serif;
  background: #101418;
  color: #eef3f8;
}

main { padding: 24px; }
.toolbar { display: flex; gap: 12px; align-items: center; }
.toolbar h1 { margin-right: auto; }
.grid { display: grid; grid-template-columns: 420px 1fr; gap: 20px; margin-top: 24px; }
form { display: grid; gap: 14px; }
label { display: grid; gap: 6px; color: #b8c2cc; }
input, button {
  border: 1px solid #38424c;
  border-radius: 6px;
  background: #171d23;
  color: #eef3f8;
  padding: 10px 12px;
}
button { cursor: pointer; background: #245bff; border-color: #245bff; }
pre {
  min-height: 480px;
  overflow: auto;
  padding: 16px;
  border: 1px solid #2b343d;
  background: #0b0f13;
  border-radius: 8px;
}
```

- [ ] **Step 5: Verify Electron syntax**

Run:

```powershell
node --check .\electron\main.mjs
node --check .\electron\preload.mjs
```

Expected: no output.

---

## Task 3: Add Config Store And Health Check

**Files:**
- Create: `electron/services/config-store.mjs`
- Create: `electron/services/health-check.mjs`
- Create: `electron/services/path-resolver.mjs`
- Create: `scripts/check-electron-config.mjs`

- [ ] **Step 1: Write `path-resolver.mjs`**

```js
import { app } from "electron";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const electronDir = dirname(fileURLToPath(import.meta.url));

export function appDataDir() {
  return join(app.getPath("userData"), "data");
}

export function repoRoot() {
  return process.env.HERMES_ROOT || resolve(electronDir, "../..");
}

export function outputDir() {
  return process.env.HERMES_OUTPUT_DIR || join(appDataDir(), "outputs");
}
```

- [ ] **Step 2: Write `config-store.mjs`**

```js
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { appDataDir, outputDir } from "./path-resolver.mjs";

export async function configPath() {
  const dir = appDataDir();
  await mkdir(dir, { recursive: true });
  return join(dir, "config.json");
}

export async function readConfig() {
  const path = await configPath();
  const existing = await readFile(path, "utf8").then(JSON.parse).catch(() => ({}));
  return {
    telegramBotToken: "",
    allowFrom: "",
    openRouterKey: "",
    ttsRoot: "",
    outputDir: outputDir(),
    ...existing,
  };
}

export async function writeConfig(patch) {
  const next = { ...(await readConfig()), ...patch };
  const path = await configPath();
  await writeFile(path, JSON.stringify(next, null, 2), "utf8");
  return next;
}
```

- [ ] **Step 3: Write `health-check.mjs`**

```js
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readConfig } from "./config-store.mjs";
import { repoRoot } from "./path-resolver.mjs";

function commandOk(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  return { ok: result.status === 0, stdout: result.stdout, stderr: result.stderr };
}

export async function runHealthCheck() {
  const config = await readConfig();
  const root = repoRoot();
  const checks = [
    { name: "telegram bot token", ok: Boolean(config.telegramBotToken || process.env.HERMES_BOT_TOKEN) },
    { name: "allowed chat/user id", ok: Boolean(config.allowFrom) },
    { name: "openrouter key", ok: Boolean(config.openRouterKey || process.env.OPENROUTER_API_KEY) },
    { name: "tts root", ok: Boolean(config.ttsRoot && existsSync(config.ttsRoot)) },
    { name: "bot script", ok: existsSync(join(root, "telegram-flow-news-bot.mjs")) },
    { name: "renderer script", ok: existsSync(join(root, "scripts/render-youtube-with-tts.mjs")) },
    { name: "node syntax", ...commandOk(process.execPath, ["--check", join(root, "telegram-flow-news-bot.mjs")]) },
  ];
  return { ok: checks.every((item) => item.ok), checks };
}
```

- [ ] **Step 4: Write smoke test**

Create `scripts/check-electron-config.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync("electron/main.mjs", "utf8");
const preload = readFileSync("electron/preload.mjs", "utf8");
const health = readFileSync("electron/services/health-check.mjs", "utf8");
const worker = readFileSync("electron/services/worker-manager.mjs", "utf8");

assert.match(main, /worker:start/);
assert.match(preload, /startWorker/);
assert.match(health, /telegram bot token/);
assert.match(worker, /telegram-flow-news-bot\.mjs/);

console.log(JSON.stringify({ ok: true, checked: "electron-config" }));
```

- [ ] **Step 5: Run smoke test**

Run:

```powershell
node .\scripts\check-electron-config.mjs
```

Expected before Task 4: FAIL because `worker-manager.mjs` is missing. This confirms the test catches the missing service.

---

## Task 4: Add Worker Manager

**Files:**
- Create: `electron/services/worker-manager.mjs`
- Modify: `electron/services/health-check.mjs`
- Modify: `scripts/check-electron-config.mjs`

- [ ] **Step 1: Create worker manager**

```js
import { spawn } from "node:child_process";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { repoRoot, outputDir, appDataDir } from "./path-resolver.mjs";

export function createWorkerManager(emit = () => {}) {
  let child = null;

  function status() {
    return child
      ? { running: true, pid: child.pid }
      : { running: false, pid: null };
  }

  async function writeRuntimeFiles(config) {
    const dataDir = appDataDir();
    await mkdir(dataDir, { recursive: true });
    await mkdir(outputDir(), { recursive: true });
    const telegramConfigPath = join(dataDir, "telegram-flow-news-config.json");
    const openRouterPath = join(dataDir, "openrouter.txt.txt");

    await writeFile(telegramConfigPath, JSON.stringify({
      botToken: config.telegramBotToken,
      allowFrom: config.allowFrom ? [String(config.allowFrom)] : [],
    }, null, 2), "utf8");

    await writeFile(openRouterPath, String(config.openRouterKey || ""), "utf8");

    return { telegramConfigPath, openRouterPath };
  }

  async function start(config) {
    if (child) return status();
    const root = repoRoot();
    const runtime = await writeRuntimeFiles(config);
    child = spawn(process.execPath, [join(root, "telegram-flow-news-bot.mjs"), "--watch"], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        HERMES_ROOT: root,
        HERMES_OUTPUT_DIR: config.outputDir || outputDir(),
        HERMES_CONFIG_FILE: runtime.telegramConfigPath,
        HERMES_OPENROUTER_KEY_FILE: runtime.openRouterPath,
        HERMES_TTS_ROOT: config.ttsRoot || "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => emit({ type: "stdout", text: chunk.toString() }));
    child.stderr.on("data", (chunk) => emit({ type: "stderr", text: chunk.toString() }));
    child.on("exit", (code) => {
      emit({ type: "exit", code });
      child = null;
    });
    return status();
  }

  function stop() {
    if (child) {
      child.kill("SIGTERM");
      child = null;
    }
    return status();
  }

  return { start, stop, status };
}
```

- [ ] **Step 2: Run smoke test**

Run:

```powershell
node .\scripts\check-electron-config.mjs
```

Expected: PASS.

---

## Task 5: Package Supertonic TTS Strategy

**Files:**
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Modify: `electron/services/health-check.mjs`
- Create: `docs/ELECTRON_INSTALL_GUIDE.md`

- [ ] **Step 1: Decide TTS packaging mode**

Recommended first release: **external TTS path**. Do not bundle the full Supertonic model into the installer yet. Reason: model/runtime size and Python environment can make the installer huge and fragile.

Required user setup:

```text
Install or copy Supertonic TTS folder to the new computer.
In Hermes Desktop, set Supertonic TTS Root to the folder containing src/supertonic3_engine.py and .venv-win/Scripts/python.exe.
```

- [ ] **Step 2: Add health checks**

Add to `health-check.mjs`:

```js
const ttsPython = config.ttsRoot ? join(config.ttsRoot, ".venv-win/Scripts/python.exe") : "";
const ttsEngine = config.ttsRoot ? join(config.ttsRoot, "src/supertonic3_engine.py") : "";
checks.push({ name: "tts python", ok: Boolean(ttsPython && existsSync(ttsPython)) });
checks.push({ name: "tts engine", ok: Boolean(ttsEngine && existsSync(ttsEngine)) });
```

- [ ] **Step 3: Write install guide**

Create `docs/ELECTRON_INSTALL_GUIDE.md`:

```markdown
# Hermes Desktop Install Guide

## Required First-Run Setup

1. Install Hermes Desktop.
2. Open Hermes.
3. Paste Telegram bot token.
4. Enter allowed Telegram user/chat ID.
5. Paste OpenRouter API key.
6. Set Supertonic TTS Root.
7. Click Health Check.
8. Click Start Worker.
9. When Google Flow opens, log in once with the target Google account.

## Notes

- Google Flow credentials are not bundled.
- OpenRouter key and optional Telegram bot token are stored in the app data config file.
- Final videos are written under the configured output directory.
```

---

## Task 5A: Add Shared YouTube Job Schema

**Files:**
- Create: `youtube-job-schema.mjs`
- Create: `scripts/check-youtube-job-schema.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write schema smoke test**

Create `scripts/check-youtube-job-schema.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  DEFAULT_YOUTUBE_JOB_OPTIONS,
  normalizeYouTubeJobRequest,
  SCRIPT_LENGTH_PRESETS,
  SUBTITLE_STYLE_PRESETS,
  VOICE_PRESETS,
} from "../youtube-job-schema.mjs";

assert.ok(SCRIPT_LENGTH_PRESETS.short.sceneCount >= 3, "short preset should create multiple scenes");
assert.ok(SCRIPT_LENGTH_PRESETS.standard.targetSeconds >= 60, "standard preset should support normal shorts length");
assert.ok(VOICE_PRESETS.some((voice) => voice.id === "M1"), "Supertonic M1 voice preset should exist");
assert.ok(SUBTITLE_STYLE_PRESETS.some((style) => style.id === "bold-shorts"), "bold shorts subtitle preset should exist");

const keywordJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "최신 AI 뉴스",
  options: { scriptLengthPreset: "standard", voiceId: "M1", subtitleStyleId: "bold-shorts" },
});

assert.equal(keywordJob.sourceType, "keyword");
assert.equal(keywordJob.options.voiceId, "M1");
assert.equal(keywordJob.options.subtitleStyleId, "bold-shorts");
assert.equal(keywordJob.options.scriptLengthPreset, "standard");
assert.equal(keywordJob.options.sendIntermediateMedia, false);

const urlJob = normalizeYouTubeJobRequest({
  sourceType: "url",
  sourceValue: "https://example.com/article",
  options: DEFAULT_YOUTUBE_JOB_OPTIONS,
});

assert.equal(urlJob.sourceType, "url");
assert.match(urlJob.sourceValue, /^https:\/\//);

assert.throws(
  () => normalizeYouTubeJobRequest({ sourceType: "keyword", sourceValue: "", options: {} }),
  /sourceValue/,
);

console.log(JSON.stringify({ ok: true, checked: "youtube-job-schema" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scripts\check-youtube-job-schema.mjs
```

Expected: FAIL because `youtube-job-schema.mjs` does not exist yet.

- [ ] **Step 3: Implement job schema and presets**

Create `youtube-job-schema.mjs`:

```js
export const SCRIPT_LENGTH_PRESETS = {
  micro: { id: "micro", label: "30초", targetSeconds: 30, sceneCount: 3, wordsMin: 75, wordsMax: 95 },
  short: { id: "short", label: "45초", targetSeconds: 45, sceneCount: 4, wordsMin: 105, wordsMax: 130 },
  standard: { id: "standard", label: "60초", targetSeconds: 60, sceneCount: 5, wordsMin: 140, wordsMax: 170 },
  extended: { id: "extended", label: "90초", targetSeconds: 90, sceneCount: 6, wordsMin: 205, wordsMax: 250 },
};

export const VOICE_PRESETS = [
  { id: "M1", label: "남성 뉴스톤", engine: "supertonic", defaultSpeed: 1.08 },
  { id: "F1", label: "여성 뉴스톤", engine: "supertonic", defaultSpeed: 1.06 },
  { id: "M2", label: "남성 다큐톤", engine: "supertonic", defaultSpeed: 1.0 },
];

export const SUBTITLE_STYLE_PRESETS = [
  {
    id: "clean-news",
    label: "클린 뉴스",
    ass: { fontName: "Malgun Gothic", fontSize: 18, outline: 2, shadow: 1, marginV: 60, primaryColour: "&H00FFFFFF" },
  },
  {
    id: "bold-shorts",
    label: "볼드 쇼츠",
    ass: { fontName: "Malgun Gothic", fontSize: 24, outline: 4, shadow: 1, marginV: 78, primaryColour: "&H00FFFFFF" },
  },
  {
    id: "minimal",
    label: "미니멀",
    ass: { fontName: "Malgun Gothic", fontSize: 17, outline: 1, shadow: 0, marginV: 54, primaryColour: "&H00FFFFFF" },
  },
];

export const DEFAULT_YOUTUBE_JOB_OPTIONS = {
  scriptLengthPreset: "standard",
  voiceId: "M1",
  speechSpeed: 1.08,
  subtitleStyleId: "bold-shorts",
  aspectRatio: "9:16",
  renderQuality: "shorts-hq",
  characterMode: "consistent-presenter",
  sendIntermediateMedia: false,
};

export function normalizeYouTubeJobRequest(input) {
  const sourceType = input?.sourceType === "url" ? "url" : "keyword";
  const sourceValue = String(input?.sourceValue || "").trim();
  if (!sourceValue) throw new Error("sourceValue is required");
  if (sourceType === "url" && !/^https?:\/\//i.test(sourceValue)) throw new Error("url sourceValue must start with http:// or https://");

  const options = { ...DEFAULT_YOUTUBE_JOB_OPTIONS, ...(input.options || {}) };
  if (!SCRIPT_LENGTH_PRESETS[options.scriptLengthPreset]) throw new Error(`Unknown scriptLengthPreset: ${options.scriptLengthPreset}`);
  if (!VOICE_PRESETS.some((voice) => voice.id === options.voiceId)) throw new Error(`Unknown voiceId: ${options.voiceId}`);
  if (!SUBTITLE_STYLE_PRESETS.some((style) => style.id === options.subtitleStyleId)) throw new Error(`Unknown subtitleStyleId: ${options.subtitleStyleId}`);

  return {
    id: input.id || `youtube-${Date.now()}`,
    sourceType,
    sourceValue,
    options,
    createdAt: input.createdAt || new Date().toISOString(),
    requestedBy: input.requestedBy || "desktop",
  };
}
```

- [ ] **Step 4: Run schema test**

Run:

```powershell
node .\scripts\check-youtube-job-schema.mjs
```

Expected: PASS.

---

## Task 5B: Extract Reusable YouTube Job Runner

**Files:**
- Create: `youtube-job-runner.mjs`
- Modify: `youtube-workflow.mjs`
- Modify: `telegram-flow-news-bot.mjs`
- Create: `scripts/check-youtube-job-runner.mjs`

- [ ] **Step 1: Write runner contract test**

Create `scripts/check-youtube-job-runner.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const runner = readFileSync(resolve(root, "youtube-job-runner.mjs"), "utf8");
const bot = readFileSync(resolve(root, "telegram-flow-news-bot.mjs"), "utf8");

assert.match(runner, /normalizeYouTubeJobRequest/, "Runner should normalize the shared job schema");
assert.match(runner, /runYouTubeJob/, "Runner should export runYouTubeJob");
assert.match(runner, /sendIntermediateMedia/, "Runner should honor final-only media delivery option");
assert.match(bot, /runYouTubeJob/, "Telegram bot should call shared runner instead of owning the workflow");
assert.match(bot, /requestedBy:\s*\"telegram\"/, "Telegram adapter should tag job origin");

console.log(JSON.stringify({ ok: true, checked: "youtube-job-runner" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scripts\check-youtube-job-runner.mjs
```

Expected: FAIL because `youtube-job-runner.mjs` is missing.

- [ ] **Step 3: Implement runner shell**

Create `youtube-job-runner.mjs`:

```js
import { normalizeYouTubeJobRequest } from "./youtube-job-schema.mjs";
import { generateYouTubeWorkflowAssets, renderFinalYouTubeVideo } from "./youtube-workflow.mjs";

export async function runYouTubeJob(input, context = {}) {
  const job = normalizeYouTubeJobRequest(input);
  const emit = context.emit || (() => {});

  emit({ type: "job-started", job });
  const assets = await generateYouTubeWorkflowAssets(job, { ...context, emit });
  emit({ type: "assets-ready", jobId: job.id, assets });
  const finalVideo = await renderFinalYouTubeVideo(job, assets, { ...context, emit });
  emit({ type: "job-completed", jobId: job.id, finalVideo });

  return { job, assets, finalVideo };
}
```

- [ ] **Step 4: Split existing workflow exports**

In `youtube-workflow.mjs`, expose two reusable stages:

```js
export async function generateYouTubeWorkflowAssets(job, context = {}) {
  // Reuse current script, scene prompt, character profile, and Flow generation logic.
  // Return script metadata, scene list, downloaded media paths, and render manifest path.
}

export async function renderFinalYouTubeVideo(job, assets, context = {}) {
  // Reuse current TTS + subtitle + ffmpeg render logic.
  // Return the final mp4 path and media probe metadata.
}
```

Implementation constraints:

- Keep existing Telegram behavior intact through the adapter.
- Never send scene clips by default. Only emit scene-level paths to logs/job metadata.
- Always write a job-local `render-options.json` with voice, speed, subtitle style, aspect ratio, and quality.
- Preserve the current consistent character profile injection for all scenes.

- [ ] **Step 5: Convert Telegram path to adapter**

In `telegram-flow-news-bot.mjs`, convert parsed Telegram text into:

```js
await runYouTubeJob({
  sourceType: inferredSourceType,
  sourceValue: inferredSourceValue,
  options: {
    scriptLengthPreset: inferredLength || "standard",
    voiceId: inferredVoice || "M1",
    speechSpeed: inferredSpeed || 1.08,
    subtitleStyleId: inferredSubtitleStyle || "bold-shorts",
    sendIntermediateMedia: false,
  },
  requestedBy: "telegram",
}, {
  emit: (event) => sendTelegramProgress(event),
});
```

- [ ] **Step 6: Run runner test**

Run:

```powershell
node .\scripts\check-youtube-job-runner.mjs
```

Expected: PASS.

---

## Task 5C: Add App-Native Create Screen And IPC

**Files:**
- Modify: `electron/main.mjs`
- Modify: `electron/preload.mjs`
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Modify: `electron/renderer/styles.css`
- Create: `electron/services/youtube-job-service.mjs`
- Create: `electron/services/job-store.mjs`
- Create: `scripts/check-electron-youtube-studio.mjs`

- [ ] **Step 1: Write UI/IPC smoke test**

Create `scripts/check-electron-youtube-studio.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const renderer = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const preload = readFileSync(resolve(root, "electron/preload.mjs"), "utf8");
const main = readFileSync(resolve(root, "electron/main.mjs"), "utf8");

assert.match(html, /name="sourceType"/, "Create screen should offer keyword/url source mode");
assert.match(html, /name="sourceValue"/, "Create screen should include keyword/url input");
assert.match(html, /name="scriptLengthPreset"/, "Create screen should include script length selection");
assert.match(html, /name="voiceId"/, "Create screen should include voice selection");
assert.match(html, /name="subtitleStyleId"/, "Create screen should include subtitle style selection");
assert.match(preload, /youtubeCreateJob/, "Preload should expose youtubeCreateJob");
assert.match(main, /youtube:create-job/, "Main process should register youtube:create-job IPC");
assert.match(renderer, /Generate Final Video/, "Renderer should expose final video generation action");

console.log(JSON.stringify({ ok: true, checked: "electron-youtube-studio" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scripts\check-electron-youtube-studio.mjs
```

Expected: FAIL until UI and IPC are added.

- [ ] **Step 3: Add app-native IPC**

In `electron/preload.mjs`, expose:

```js
youtubeCreateJob: (payload) => ipcRenderer.invoke("youtube:create-job", payload),
youtubeCancelJob: (jobId) => ipcRenderer.invoke("youtube:cancel-job", jobId),
youtubeListJobs: () => ipcRenderer.invoke("youtube:list-jobs"),
onYoutubeJobEvent: (handler) => ipcRenderer.on("youtube:job-event", (_event, payload) => handler(payload)),
```

In `electron/main.mjs`, register:

```js
ipcMain.handle("youtube:create-job", async (_event, payload) => youtubeJobService.createAndRun(payload));
ipcMain.handle("youtube:cancel-job", async (_event, jobId) => youtubeJobService.cancel(jobId));
ipcMain.handle("youtube:list-jobs", async () => youtubeJobService.listJobs());
```

- [ ] **Step 4: Build `youtube-job-service.mjs`**

The service must:

- Normalize requests through `youtube-job-schema.mjs`.
- Persist job state to `job-store.mjs`.
- Stream events from `runYouTubeJob` to the renderer.
- Support one active render at a time for the first release.
- Mark jobs as `queued`, `running`, `failed`, `completed`, or `cancelled`.
- Store final mp4 path and probe metadata.

- [ ] **Step 5: Build Create UI**

The first screen after setup should be the production interface, not a marketing page. Required controls:

```text
Source mode segmented control: Keyword | URL
Keyword/URL input
Script length select: 30s | 45s | 60s | 90s | Custom
Voice select: M1 | F1 | M2 | Custom
Speech speed number/slider: 0.85 to 1.25
Subtitle style select: Clean News | Bold Shorts | Minimal
Character consistency select: No Person | Consistent Presenter | Saved Character
Render quality select: Fast Preview | Shorts HQ
Generate Final Video button
Cancel button
Latest final video preview/open button
Job history list
Live logs panel
```

Design requirements:

- Put creation controls in a dense left panel and job/output status on the right.
- Use tabs for `Create`, `Jobs`, `Settings`, and `Diagnostics`.
- Use compact controls; avoid a landing-page hero.
- Show only final mp4 in the output preview by default.
- Keep Telegram controls under `Settings` or `Remote Control`, because Telegram is optional.

- [ ] **Step 6: Run UI/IPC smoke test**

Run:

```powershell
node .\scripts\check-electron-youtube-studio.mjs
```

Expected: PASS.

---

## Task 5D: Add Script Length, Voice, And Subtitle Options To Rendering

**Files:**
- Modify: `youtube-workflow.mjs`
- Modify: `scripts/make-scenes-tts.py`
- Modify: `scripts/render-youtube-with-tts.mjs`
- Create: `scripts/check-render-options.mjs`

- [ ] **Step 1: Write render-options test**

Create `scripts/check-render-options.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");
const tts = readFileSync(resolve(root, "scripts/make-scenes-tts.py"), "utf8");
const renderer = readFileSync(resolve(root, "scripts/render-youtube-with-tts.mjs"), "utf8");

assert.match(workflow, /render-options\.json/, "Workflow should write render-options.json per job");
assert.match(workflow, /scriptLengthPreset/, "Workflow should pass script length preset into generation prompt");
assert.match(tts, /HERMES_RENDER_OPTIONS/, "TTS should read render options path");
assert.match(tts, /voiceId|voice_id/, "TTS should use selected voice id");
assert.match(tts, /speechSpeed|speech_speed/, "TTS should use selected speech speed");
assert.match(renderer, /subtitleStyleId/, "Renderer should read selected subtitle style");
assert.match(renderer, /force_style/, "Renderer should build ASS force_style from preset");

console.log(JSON.stringify({ ok: true, checked: "render-options" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scripts\check-render-options.mjs
```

Expected: FAIL until scripts read render options.

- [ ] **Step 3: Pass script length into AI generation**

When building the script prompt, include preset constraints from `SCRIPT_LENGTH_PRESETS`:

```text
Target length: 60 seconds.
Scene count: 5.
Korean narration words: 140-170.
Each scene must contain one narration segment and one visual prompt.
Do not exceed the target length; final TTS duration will be used for render timing.
```

URL mode must adapt the source article instead of copying it:

```text
If sourceType is url, summarize and transform the article into a YouTube Shorts script.
Preserve factual claims, avoid adding unsupported details, and write a new narration.
```

- [ ] **Step 4: Write per-job render options**

Before calling TTS or ffmpeg, write:

```json
{
  "jobId": "youtube-...",
  "voiceId": "M1",
  "speechSpeed": 1.08,
  "subtitleStyleId": "bold-shorts",
  "aspectRatio": "9:16",
  "renderQuality": "shorts-hq",
  "scriptLengthPreset": "standard"
}
```

Pass it to child processes:

```js
env: {
  ...process.env,
  HERMES_RENDER_OPTIONS: renderOptionsPath,
}
```

- [ ] **Step 5: Update Supertonic TTS script**

In `scripts/make-scenes-tts.py`:

- Read `HERMES_RENDER_OPTIONS`.
- Parse `voiceId` and map it to Supertonic voice id.
- Parse `speechSpeed` and apply it instead of hard-coded `speed=1.08`.
- Keep defaults compatible with existing jobs.
- Write actual audio durations into the scene manifest so subtitle timing follows the real voice output.

- [ ] **Step 6: Update ffmpeg subtitle style**

In `scripts/render-youtube-with-tts.mjs`:

- Read `HERMES_RENDER_OPTIONS`.
- Resolve `subtitleStyleId` through `SUBTITLE_STYLE_PRESETS`.
- Build `force_style` dynamically.
- Keep `clean-news` as fallback when style is missing.
- Use measured audio durations to align subtitles scene-by-scene.
- Fail the render if total video duration is shorter than total audio duration by more than 0.5 seconds.

- [ ] **Step 7: Run render-options test**

Run:

```powershell
node .\scripts\check-render-options.mjs
```

Expected: PASS.

---

## Task 5E: Add Expert Production Features For A Reliable Shorts Studio

**Files:**
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Modify: `electron/services/youtube-job-service.mjs`
- Modify: `youtube-workflow.mjs`

- [ ] **Step 1: Add preflight checklist before each job**

Before `Generate Final Video` starts, the app must check:

- OpenRouter key exists.
- Google Flow browser profile is logged in or ready to open.
- Supertonic TTS root exists.
- ffmpeg is available.
- Output directory is writable.
- No active render is already running.

If one item fails, show a precise fix action in the UI.

- [ ] **Step 2: Add job quality gates**

Each completed job should run the existing media probe and validate:

- Final mp4 exists.
- Duration is within expected preset range.
- Audio stream exists.
- Video stream exists.
- Subtitle burn-in command completed.
- Scene count matches the manifest or failed scenes were explicitly regenerated.
- Final duration is not cut shorter than narration duration.

- [ ] **Step 3: Add retry and recovery policy**

The app should use this default policy:

```json
{
  "flowSceneRetries": 2,
  "ttsRetries": 1,
  "renderRetries": 1,
  "skipSceneOnFinalFailure": false,
  "requireAllScenesForFinalRender": true
}
```

Reason: for finished YouTube output, skipping scenes makes the final video feel broken. Debug mode may allow partial output, but production mode should require all scenes.

- [ ] **Step 4: Add prompt consistency controls**

For any job that includes a person or character:

- Generate one `character_profile` at the script stage.
- Store age range, gender presentation, ethnicity/skin tone, hair, wardrobe, role, and camera style.
- Inject the exact profile into every scene prompt.
- Let the user choose `No Person` when they want abstract/news B-roll.
- Let the user save a profile as a reusable preset.

Video prompt generation rule:

```text
For each scene, derive the visual prompt from that scene's narration, key facts, emotional beat, and required continuity profile.
Do not make generic prompts from only the global keyword.
If a character appears, reuse the same character profile verbatim in every scene.
If the scene is news or explainer content, prefer consistent presenter plus relevant B-roll, charts, devices, locations, or symbolic objects.
```

- [ ] **Step 5: Add output library**

The `Jobs` tab should show:

- Job title.
- Source keyword or URL.
- Preset length, voice, subtitle style.
- Status and failure reason.
- Final mp4 path.
- Render duration and created time.
- Buttons: `Open`, `Reveal Folder`, `Copy Path`, `Send To Telegram` when Telegram is configured.

- [ ] **Step 6: Add optional Telegram mode**

Telegram configuration should be disabled by default and clearly optional:

```text
Remote Control: Off | Telegram
Bot Token
Allowed Chat/User ID
Start Telegram Worker
Stop Telegram Worker
Send final renders to Telegram: on/off
Send debug screenshots: off by default
```

Telegram commands should support the same options as the app:

```text
/yt 최신 AI 뉴스 길이=60초 음성=M1 자막=bold
/yt https://example.com/article 길이=90초 음성=F1 자막=clean
```

Expected behavior:

- Telegram and app jobs use the same queue.
- Telegram receives progress text and final mp4 only.
- Scene clips, screenshots, and intermediate files are only sent when debug mode is enabled.

---

## Task 5F: Add YouTube OAuth And Upload Pipeline

**Architecture decision from review:** implement YouTube OAuth/upload, metadata, thumbnail review, and thumbnail rendering in JavaScript/Node.js. Do not create Python upload scripts, do not add `requirements-youtube-upload.txt`, and do not require `google-auth`, `google-auth-oauthlib`, `google-api-python-client`, Pillow, or OpenCV for upload/thumbnail features. The only remaining Python dependency in the product is the external Supertonic TTS runtime already selected in Task 5.

**Files:**
- Create: `pipeline/youtube-auth.mjs`
- Create: `pipeline/youtube-upload.mjs`
- Create: `pipeline/youtube-meta.mjs`
- Create: `pipeline/youtube-thumbnail.mjs`
- Create: `pipeline/youtube-thumbnail-prompt.mjs`
- Create: `pipeline/youtube-review-flow.mjs`
- Create: `automation/chatgpt-thumbnail-source.mjs`
- Create: `scripts/check-youtube-upload-pipeline.mjs`
- Modify: `electron/services/config-store.mjs`
- Modify: `electron/services/health-check.mjs`
- Modify: `electron/services/job-store.mjs`
- Modify: `youtube-job-schema.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write upload pipeline smoke test**

Create `scripts/check-youtube-upload-pipeline.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = {
  auth: resolve(root, "pipeline/youtube-auth.mjs"),
  upload: resolve(root, "pipeline/youtube-upload.mjs"),
  meta: resolve(root, "pipeline/youtube-meta.mjs"),
  thumbnail: resolve(root, "pipeline/youtube-thumbnail.mjs"),
  thumbnailPrompt: resolve(root, "pipeline/youtube-thumbnail-prompt.mjs"),
  review: resolve(root, "pipeline/youtube-review-flow.mjs"),
  chatgptThumbnailSource: resolve(root, "automation/chatgpt-thumbnail-source.mjs"),
};

for (const [name, file] of Object.entries(files)) {
  assert.ok(existsSync(file), `${name} file should exist: ${file}`);
}

const auth = readFileSync(files.auth, "utf8");
assert.match(auth, /youtube\.upload/, "OAuth scopes should include youtube.upload");
assert.match(auth, /google\.auth\.OAuth2/, "Auth should use googleapis OAuth2 client");
assert.match(auth, /refreshAccessToken|getAccessToken/, "Auth should refresh expired credentials");
assert.match(auth, /youtube_token\.json/, "Auth should persist a token file");

const upload = readFileSync(files.upload, "utf8");
assert.match(upload, /google\.youtube/, "Upload should use googleapis YouTube client");
assert.match(upload, /createReadStream/, "Upload should stream video from disk");
assert.match(upload, /videos\.insert/, "Upload should call videos.insert");
assert.match(upload, /containsSyntheticMedia/, "Upload body should disclose synthetic media");
assert.match(upload, /thumbnails\(\)\.set/, "Upload should bind thumbnail after video upload");

const meta = readFileSync(files.meta, "utf8");
assert.match(meta, /sanitizeTitle/, "Metadata module should sanitize title");
assert.match(meta, /sanitizeTags/, "Metadata module should sanitize tags");

const thumbnail = readFileSync(files.thumbnail, "utf8");
assert.match(thumbnail, /1280/, "Thumbnail should render 1280px wide output");
assert.match(thumbnail, /720/, "Thumbnail should render 720px tall output");
assert.match(thumbnail, /sharp/, "Thumbnail should use sharp for image composition");
assert.match(thumbnail, /chatgpt/i, "Thumbnail should prefer ChatGPT authenticated image output before frame fallback");

const thumbnailPrompt = readFileSync(files.thumbnailPrompt, "utf8");
assert.match(thumbnailPrompt, /curiosity_gap/, "Thumbnail prompt should derive a curiosity gap");
assert.match(thumbnailPrompt, /script_context/, "Thumbnail prompt should use script context");
assert.match(thumbnailPrompt, /negative_prompt/, "Thumbnail prompt should include negative prompt guidance");

const chatgptSource = readFileSync(files.chatgptThumbnailSource, "utf8");
assert.match(chatgptSource, /chatgpt\.com/i, "Thumbnail source should open ChatGPT web");
assert.match(chatgptSource, /keyboard\.type|pressSequentially/i, "Thumbnail source should type with keystroke-style input");
assert.match(chatgptSource, /이미지 만들기|Create image|image/i, "Thumbnail source should select the image creation tool");
assert.match(chatgptSource, /download/i, "Thumbnail source should download the generated image");

const review = readFileSync(files.review, "utf8");
assert.match(review, /awaiting_upload_confirmation/, "Review flow should enforce approval state");
assert.match(review, /narration_provenance/, "Review should guard TTS provenance");
assert.match(review, /script_language_guard/, "Review should guard Korean text corruption");
assert.match(review, /classify_upload_error/, "Review should classify upload errors");

console.log(JSON.stringify({ ok: true, checked: "youtube-upload-pipeline" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scripts\check-youtube-upload-pipeline.mjs
```

Expected: FAIL because upload pipeline files do not exist yet.

- [ ] **Step 3: Add native Node upload dependencies**

Modify `package.json`:

```json
{
  "dependencies": {
    "googleapis": "^144.0.0",
    "sharp": "^0.33.5"
  }
}
```

Expected dependency policy:

```text
No Python upload requirements file is created.
No google-auth, google-auth-oauthlib, google-api-python-client, Pillow, or OpenCV dependency is added.
YouTube upload and thumbnail post-processing stay inside Node.js.
```

- [ ] **Step 4: Implement Node.js OAuth credential manager**

Create `pipeline/youtube-auth.mjs`:

```js
import { google } from "googleapis";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

export function youtubeAuthPaths(appDataDir) {
  return {
    clientSecretPath: join(appDataDir, "client_secrets.json"),
    tokenPath: join(appDataDir, "youtube_token.json"),
  };
}

export function loadClientSecrets(clientSecretPath) {
  const raw = JSON.parse(readFileSync(clientSecretPath, "utf8"));
  const config = raw.installed || raw.web;
  if (!config?.client_id || !config?.client_secret) {
    throw new Error("client_secrets.json must contain installed or web OAuth client credentials");
  }
  const redirectUri = config.redirect_uris?.find((uri) => uri.startsWith("http://127.0.0.1")) || config.redirect_uris?.[0] || "http://127.0.0.1";
  return { clientId: config.client_id, clientSecret: config.client_secret, redirectUri };
}

export function createOAuthClient(appDataDir) {
  const { clientSecretPath, tokenPath } = youtubeAuthPaths(appDataDir);
  if (!existsSync(clientSecretPath)) throw new Error(`Missing YouTube OAuth client secret: ${clientSecretPath}`);
  const secrets = loadClientSecrets(clientSecretPath);
  const oauth2 = new google.auth.OAuth2(secrets.clientId, secrets.clientSecret, secrets.redirectUri);
  if (existsSync(tokenPath)) oauth2.setCredentials(JSON.parse(readFileSync(tokenPath, "utf8")));
  oauth2.on("tokens", (tokens) => {
    const merged = { ...(existsSync(tokenPath) ? JSON.parse(readFileSync(tokenPath, "utf8")) : {}), ...tokens };
    mkdirSync(dirname(tokenPath), { recursive: true });
    writeFileSync(tokenPath, JSON.stringify(merged, null, 2), "utf8");
  });
  return { oauth2, tokenPath, clientSecretPath };
}

export function getAuthUrl(appDataDir) {
  const { oauth2 } = createOAuthClient(appDataDir);
  return oauth2.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: YOUTUBE_SCOPES });
}

export async function saveAuthCode(appDataDir, code) {
  const { oauth2, tokenPath } = createOAuthClient(appDataDir);
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);
  mkdirSync(dirname(tokenPath), { recursive: true });
  writeFileSync(tokenPath, JSON.stringify(tokens, null, 2), "utf8");
  return authStatus(appDataDir);
}

export async function getAuthorizedYouTube(appDataDir) {
  const { oauth2 } = createOAuthClient(appDataDir);
  await oauth2.getAccessToken();
  return google.youtube({ version: "v3", auth: oauth2 });
}

export function authStatus(appDataDir) {
  const { clientSecretPath, tokenPath } = youtubeAuthPaths(appDataDir);
  return {
    ok: existsSync(clientSecretPath) && existsSync(tokenPath),
    hasClientSecret: existsSync(clientSecretPath),
    hasToken: existsSync(tokenPath),
    clientSecretPath,
    tokenPath,
  };
}
```

- [ ] **Step 5: Implement JavaScript metadata sanitizer**

Create `pipeline/youtube-meta.mjs`:

```js
const HTML_TAG_RE = /<[^>]+>/g;
const SPACE_RE = /\s+/g;

export function sanitizeText(value, maxLength) {
  const text = String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(HTML_TAG_RE, " ")
    .replace(SPACE_RE, " ")
    .trim();
  if (maxLength && text.length > maxLength) return `${text.slice(0, maxLength - 1).trim()}...`;
  return text;
}

export function sanitizeTitle(value) {
  return sanitizeText(value, 100) || "Hermes Shorts";
}

export function sanitizeDescription(value) {
  return sanitizeText(value, 5000);
}

export function sanitizeTags(tags) {
  const raw = Array.isArray(tags) ? tags : String(tags || "").split(",");
  const seen = new Set();
  const clean = [];
  for (const tag of raw) {
    const normalized = sanitizeText(String(tag).replaceAll("#", ""), 80);
    const key = normalized.toLowerCase();
    if (normalized && !seen.has(key)) {
      seen.add(key);
      clean.push(normalized);
    }
  }
  return clean.slice(0, 30);
}

export function toVideoBody(meta) {
  return {
    snippet: {
      title: sanitizeTitle(meta.title),
      description: sanitizeDescription(meta.description),
      tags: sanitizeTags(meta.tags),
      categoryId: String(meta.categoryId || "25"),
    },
    status: {
      privacyStatus: meta.privacyStatus || "private",
      selfDeclaredMadeForKids: Boolean(meta.madeForKids),
      containsSyntheticMedia: meta.containsSyntheticMedia !== false,
    },
  };
}
```

- [ ] **Step 6: Implement JavaScript upload executor**

Create `pipeline/youtube-upload.mjs`:

```js
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { getAuthorizedYouTube } from "./youtube-auth.mjs";
import { toVideoBody } from "./youtube-meta.mjs";

export function loadMetadata(metadataPath) {
  return JSON.parse(readFileSync(metadataPath, "utf8"));
}

export async function uploadVideo({ appDataDir, videoPath, metadataPath, thumbnailPath }) {
  if (!existsSync(videoPath)) throw new Error(`Missing video file: ${videoPath}`);
  const youtube = await getAuthorizedYouTube(appDataDir);
  const metadata = loadMetadata(metadataPath);
  const insert = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: toVideoBody(metadata),
    media: { body: createReadStream(videoPath) },
  });
  const videoId = insert.data.id;
  if (!videoId) throw new Error("YouTube upload did not return video id");

  if (thumbnailPath && existsSync(thumbnailPath)) {
    await youtube.thumbnails.set({
      videoId,
      media: { mimeType: "image/jpeg", body: createReadStream(thumbnailPath) },
    });
  }

  return {
    ok: true,
    videoId,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    privacyStatus: metadata.privacyStatus || "private",
    containsSyntheticMedia: metadata.containsSyntheticMedia !== false,
  };
}
```

- [ ] **Step 7: Implement ChatGPT authenticated thumbnail generator and `sharp` compositor**

Create `automation/chatgpt-thumbnail-source.mjs`:

```js
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

export async function generateChatGptThumbnailSource({ promptJsonPath, outputDir, profileDir, emit = () => {} }) {
  const prompt = JSON.parse(readFileSync(promptJsonPath, "utf8"));
  mkdirSync(outputDir, { recursive: true });
  const userDataDir = profileDir || resolve(process.env.APPDATA || ".", "Hermes", "chatgpt-profile");
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    acceptDownloads: true,
  });
  const page = await browser.newPage();
  try {
    emit({ type: "thumbnail-chatgpt-started", prompt: prompt.image_prompt });
    await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded" });
    await page.getByRole("textbox").click();
    await page.keyboard.type(prompt.image_prompt, { delay: 18 });

    const plusButton = page.getByRole("button", { name: /첨부|추가|add|attach|\+/i }).first();
    await plusButton.click();
    const imageTool = page.getByText(/이미지 만들기|Create image|Make image|Image/i).first();
    await imageTool.click();
    await page.keyboard.press("Enter");

    const download = await page.waitForEvent("download", { timeout: 240000 });
    const imagePath = resolve(outputDir, download.suggestedFilename() || "chatgpt-thumbnail-source.png");
    await download.saveAs(imagePath);
    emit({ type: "thumbnail-chatgpt-completed", imagePath });
    return {
      imagePath,
      method: "chatgpt-authenticated-browser",
      hookHeadline: prompt.hook_headline,
      curiosityGap: prompt.curiosity_gap,
      promptPath: promptJsonPath,
      outputDir,
    };
  } catch (error) {
    const screenshotPath = resolve(outputDir, "chatgpt-thumbnail-failure.png");
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    error.screenshotPath = screenshotPath;
    throw error;
  } finally {
    await browser.close();
  }
}
```

Create `pipeline/youtube-thumbnail.mjs`:

```js
import sharp from "sharp";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { generateChatGptThumbnailSource } from "../automation/chatgpt-thumbnail-source.mjs";

export const THUMBNAIL_SIZE = { width: 1280, height: 720 };

function escapeSvgText(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function headlineOverlaySvg(headline) {
  const safe = escapeSvgText(String(headline || "").slice(0, 28));
  return Buffer.from(`
<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
  <rect x="72" y="488" width="1136" height="150" rx="26" fill="rgba(0,0,0,0.68)"/>
  <text x="108" y="585" font-family="Malgun Gothic, Arial, sans-serif" font-size="68" font-weight="800" fill="#fff">${safe}</text>
</svg>`);
}

export async function composeThumbnail({ sourceImagePath, promptJsonPath, outputPath }) {
  const prompt = JSON.parse(readFileSync(promptJsonPath, "utf8"));
  mkdirSync(dirname(outputPath), { recursive: true });
  await sharp(sourceImagePath)
    .resize(THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height, { fit: "cover" })
    .composite([{ input: headlineOverlaySvg(prompt.hook_headline), top: 0, left: 0 }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(outputPath);
  return {
    ok: true,
    thumbnail: outputPath,
    method: "chatgpt-authenticated-browser+sharp",
    hookHeadline: prompt.hook_headline,
    curiosityGap: prompt.curiosity_gap,
  };
}

export async function generateThumbnail({ promptJsonPath, outputDir, outputPath, generateFlowMedia, emit }) {
  const source = await generateChatGptThumbnailSource({ promptJsonPath, outputDir, emit });
  return composeThumbnail({ sourceImagePath: source.imagePath, promptJsonPath, outputPath });
}
```

- [ ] **Step 8: Implement JavaScript review and error classification**

Create `pipeline/youtube-review-flow.mjs`:

```js
import { readFileSync } from "node:fs";

const KOREAN_RE = /[가-힣]/;
const MOJIBAKE_RE = /[\ufffd]|\uf9e4|\u6e72|\ub69f|\ub0ae/;

export function narration_provenance(manifest) {
  const engine = manifest.tts?.engine || manifest.ttsEngine;
  const audioFiles = manifest.audioFiles || manifest.tts?.audioFiles || [];
  return {
    name: "narration_provenance",
    ok: engine === "supertonic" && audioFiles.length > 0,
    engine,
    audioFiles: audioFiles.length,
  };
}

export function script_language_guard(manifest) {
  const script = manifest.script || manifest.narration || "";
  return { name: "script_language_guard", ok: KOREAN_RE.test(script) && !MOJIBAKE_RE.test(script) };
}

export function upload_approval_guard(state) {
  return { name: "upload_approval_guard", ok: state.phase === "awaiting_upload_confirmation", phase: state.phase };
}

export function classify_upload_error(message) {
  const text = String(message || "").toLowerCase();
  if (["500", "502", "503", "504", "timeout", "connection reset"].some((term) => text.includes(term))) {
    return { retryable: true, kind: "temporary_network", guide: "잠시 후 자동 재시도합니다." };
  }
  if (["invalid_grant", "unauthorized", "insufficientpermissions", "forbidden"].some((term) => text.includes(term))) {
    return { retryable: false, kind: "oauth_or_permission", guide: "YouTube OAuth 인증과 업로드 권한을 다시 확인하세요." };
  }
  if (text.includes("quota")) return { retryable: false, kind: "quota", guide: "YouTube Data API 할당량을 확인하세요." };
  return { retryable: false, kind: "unknown", guide: "로그를 확인한 뒤 수동으로 재시도하세요." };
}

export function runPreUploadReview({ manifestPath, statePath }) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const checks = [narration_provenance(manifest), script_language_guard(manifest), upload_approval_guard(state)];
  return { ok: checks.every((check) => check.ok), checks };
}
```

- [ ] **Step 9: Extend job schema with upload options**

Add upload defaults to `youtube-job-schema.mjs`:

```js
export const DEFAULT_UPLOAD_OPTIONS = {
  enabled: false,
  requireApproval: true,
  privacyStatus: "private",
  madeForKids: false,
  containsSyntheticMedia: true,
  categoryId: "25",
  autoThumbnail: true,
};
```

Add `upload: { ...DEFAULT_UPLOAD_OPTIONS, ...(input.upload || {}) }` to normalized jobs.

- [ ] **Step 10: Add health check for YouTube credentials**

In `electron/services/health-check.mjs`, add:

```js
checks.push({ name: "youtube client secret", ok: existsSync(join(appDataDir, "client_secrets.json")) });
checks.push({ name: "youtube token", ok: existsSync(join(appDataDir, "youtube_token.json")), optional: true });
```

The client secret should be required only when upload mode is enabled.

- [ ] **Step 11: Run upload pipeline smoke test**

Run:

```powershell
node .\scripts\check-youtube-upload-pipeline.mjs
```

Expected: PASS.

---

## Task 5G: Add Upload UI, Approval State, And Telegram Upload Commands

**Files:**
- Create: `electron/services/youtube-upload-service.mjs`
- Modify: `electron/main.mjs`
- Modify: `electron/preload.mjs`
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Modify: `electron/renderer/styles.css`
- Modify: `telegram-flow-news-bot.mjs`
- Modify: `electron/services/job-store.mjs`
- Create: `scripts/check-youtube-upload-ui.mjs`

- [ ] **Step 1: Write upload UI/IPC smoke test**

Create `scripts/check-youtube-upload-ui.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const renderer = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const preload = readFileSync(resolve(root, "electron/preload.mjs"), "utf8");
const main = readFileSync(resolve(root, "electron/main.mjs"), "utf8");
const bot = readFileSync(resolve(root, "telegram-flow-news-bot.mjs"), "utf8");

assert.match(html, /name="uploadEnabled"/, "Create screen should include upload toggle");
assert.match(html, /name="privacyStatus"/, "Upload UI should include privacy status");
assert.match(html, /name="containsSyntheticMedia"/, "Upload UI should include synthetic media disclosure");
assert.match(renderer, /Approve Upload/, "Renderer should expose upload approval action");
assert.match(preload, /youtubeApproveUpload/, "Preload should expose upload approval IPC");
assert.match(main, /youtube:approve-upload/, "Main should register upload approval IPC");
assert.match(bot, /최종업로드|approve-upload|upload-confirm/i, "Telegram should support final upload confirmation command");

console.log(JSON.stringify({ ok: true, checked: "youtube-upload-ui" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scripts\check-youtube-upload-ui.mjs
```

Expected: FAIL until UI and IPC are added.

- [ ] **Step 3: Add upload IPC**

In `electron/preload.mjs`, expose:

```js
youtubeStartAuth: () => ipcRenderer.invoke("youtube:start-auth"),
youtubeApproveUpload: (jobId) => ipcRenderer.invoke("youtube:approve-upload", jobId),
youtubeRetryUpload: (jobId) => ipcRenderer.invoke("youtube:retry-upload", jobId),
youtubeGetUploadStatus: (jobId) => ipcRenderer.invoke("youtube:upload-status", jobId),
```

In `electron/main.mjs`, register matching handlers and call `youtube-upload-service.mjs`.

- [ ] **Step 4: Implement upload service**

`electron/services/youtube-upload-service.mjs` must:

- Locate final mp4, metadata JSON, thumbnail path, manifest, and job state.
- Refuse upload unless job phase is `awaiting_upload_confirmation`.
- Call `runPreUploadReview()` from `pipeline/youtube-review-flow.mjs` before upload.
- Call `uploadVideo()` from `pipeline/youtube-upload.mjs` with `videoPath`, `metadataPath`, and optional `thumbnailPath`.
- Mark job as `uploading`, `uploaded`, or `upload_failed`.
- Store `videoId`, `watchUrl`, `privacyStatus`, upload timestamp, and failure guide.
- Never retry OAuth/permission/quota errors automatically.
- Retry temporary network errors up to 2 times.

- [ ] **Step 5: Add upload settings and approval UI**

Add controls to the `Create` tab:

```text
Upload after render: off by default
Privacy: Private | Unlisted | Public
AI synthetic media disclosure: on by default
Made for kids: off by default
Auto thumbnail: on by default
Require approval before upload: on and locked for first release
```

Add controls to the job detail view:

```text
Preview Final Video
Preview Thumbnail
Edit Title
Edit Description
Edit Tags
Approve Upload
Retry Upload
Open YouTube Video
```

Production rule:

```text
Hermes must never upload immediately after render unless the job has passed quality gates and the user has explicitly clicked Approve Upload or sent the upload confirmation command.
```

- [ ] **Step 6: Add Telegram upload confirmation**

Telegram should support:

```text
최종업로드
/upload_confirm <jobId>
/upload_status <jobId>
```

Expected behavior:

- If upload is not configured, reply with setup instructions.
- If the job has no final mp4, refuse upload.
- If the review gate fails, send the exact failed checks.
- If upload succeeds, send the YouTube watch URL.
- If upload fails due to OAuth/permission/quota, send recovery guidance instead of retrying endlessly.

- [ ] **Step 7: Run upload UI smoke test**

Run:

```powershell
node .\scripts\check-youtube-upload-ui.mjs
```

Expected: PASS.

---

## Task 5H: Add Hook-Driven ChatGPT Authenticated Thumbnail Generation

**Files:**
- Create: `pipeline/youtube-thumbnail-prompt.mjs`
- Create: `automation/chatgpt-thumbnail-source.mjs`
- Modify: `pipeline/youtube-thumbnail.mjs`
- Modify: `pipeline/youtube-meta.mjs`
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Modify: `electron/services/youtube-upload-service.mjs`
- Create: `scripts/check-chatgpt-thumbnail-pipeline.mjs`

- [ ] **Step 1: Write thumbnail pipeline smoke test**

Create `scripts/check-chatgpt-thumbnail-pipeline.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const promptPath = resolve(root, "pipeline/youtube-thumbnail-prompt.mjs");
const thumbnailPath = resolve(root, "pipeline/youtube-thumbnail.mjs");
const chatgptSourcePath = resolve(root, "automation/chatgpt-thumbnail-source.mjs");
const rendererPath = resolve(root, "electron/renderer/app.js");

for (const file of [promptPath, thumbnailPath, chatgptSourcePath]) {
  assert.ok(existsSync(file), `${file} should exist`);
}

const prompt = readFileSync(promptPath, "utf8");
assert.match(prompt, /script_context/, "Prompt builder should use script context");
assert.match(prompt, /curiosity_gap/, "Prompt builder should derive curiosity gap");
assert.match(prompt, /hook_headline/, "Prompt builder should output hook headline");
assert.match(prompt, /negative_prompt/, "Prompt builder should prevent noisy thumbnail artifacts");
assert.match(prompt, /title/, "Prompt builder should use title");

const thumbnail = readFileSync(thumbnailPath, "utf8");
assert.match(thumbnail, /generateThumbnail|ChatGPT|chatgpt/i, "Thumbnail pipeline should prefer ChatGPT authenticated image generation");
assert.match(thumbnail, /sharp/, "Thumbnail renderer should use sharp");
assert.match(thumbnail, /fallback/, "Thumbnail pipeline should keep ffmpeg frame fallback");
assert.match(thumbnail, /hook_headline/, "Thumbnail renderer should overlay or preserve hook headline");

const chatgptSource = readFileSync(chatgptSourcePath, "utf8");
assert.match(chatgptSource, /chatgpt\.com/i, "Thumbnail source should open ChatGPT web");
assert.match(chatgptSource, /keyboard\.type|pressSequentially/i, "Thumbnail source should type with keystroke-style input");
assert.match(chatgptSource, /이미지 만들기|Create image|Make image|Image/i, "Thumbnail source should choose the image creation tool");
assert.match(chatgptSource, /\+|add|attach|첨부|추가/i, "Thumbnail source should click the plus/add button before choosing image creation");
assert.match(chatgptSource, /download/i, "Thumbnail source should download the generated image");

const renderer = readFileSync(rendererPath, "utf8");
assert.match(renderer, /thumbnailMode/, "UI should expose thumbnail mode");
assert.match(renderer, /ChatGPT/, "UI should mention ChatGPT thumbnail generation");

console.log(JSON.stringify({ ok: true, checked: "chatgpt-thumbnail-pipeline" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scripts\check-chatgpt-thumbnail-pipeline.mjs
```

Expected: FAIL until the prompt builder, ChatGPT authenticated thumbnail source generator, `sharp` compositor, and UI controls exist.

- [ ] **Step 3: Implement thumbnail prompt builder**

Create `pipeline/youtube-thumbnail-prompt.mjs`:

```js
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function compact(text, limit) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, limit).trim();
}

export function inferCuriosityGap(title, scriptContext) {
  const combined = `${title}\n${scriptContext}`;
  if (["위험", "폭락", "금리", "규제", "경고"].some((term) => combined.includes(term))) return "지금 놓치면 손해 보는 위험 신호";
  if (["AI", "인공지능", "자동화", "모델"].some((term) => combined.includes(term))) return "이미 시작됐지만 대부분 모르는 변화";
  if (["비밀", "공개", "충격", "반전"].some((term) => combined.includes(term))) return "겉으로 보이는 것과 다른 진짜 이유";
  return "왜 지금 이 이슈가 중요한지 한눈에 드러내기";
}

export function buildHookHeadline(title, scriptContext) {
  const gap = inferCuriosityGap(title, scriptContext);
  const base = compact(title, 28);
  if (gap.includes("위험") || gap.includes("손해")) return compact(`${base} 지금 위험한 이유`, 26);
  if (title.toUpperCase().includes("AI") || scriptContext.toUpperCase().includes("AI")) return compact(`${base} 판이 바뀐다`, 24);
  return compact(`${base} 핵심만 보면?`, 24);
}

export function buildThumbnailPrompt({ title, scriptContext, visualContext = "" }) {
  const curiosity_gap = inferCuriosityGap(title, scriptContext);
  const hook_headline = buildHookHeadline(title, scriptContext);
  return {
    hook_headline,
    curiosity_gap,
    script_context: compact(scriptContext, 1200),
    visual_context: compact(visualContext, 700),
    image_prompt: [
      "Create a high-click-through YouTube Shorts thumbnail image in 16:9.",
      `Topic title: ${compact(title, 80)}`,
      `Script context: ${compact(scriptContext, 700)}`,
      `Visual context from scenes: ${compact(visualContext, 400)}`,
      `Curiosity gap: ${curiosity_gap}`,
      "Design direction: one strong central subject or symbolic object, high contrast, clean composition, readable negative space.",
      "Korean news/explainer style, premium YouTube thumbnail, dramatic but truthful visual tension based on the script.",
      `Place this short Korean hook headline directly inside the thumbnail image in large bold readable text: ${hook_headline}`,
      "Keep the Korean text short, clean, high contrast, and readable on mobile.",
      "If the Korean text cannot be rendered cleanly, leave enough negative space so Hermes can repair the headline later with sharp.",
      "No YouTube play button, no smartphone frame, no fake UI, no watermark, no unreadable tiny text.",
    ].join("\n"),
    negative_prompt: "clutter, tiny text, fake YouTube UI, play button icon, smartphone frame, watermark, distorted Korean letters, unreadable Korean",
  };
}

export function writeThumbnailPrompt(outputPath, input) {
  const payload = buildThumbnailPrompt(input);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}
```

- [ ] **Step 4: Implement primary ChatGPT authenticated image generator**

Use `automation/chatgpt-thumbnail-source.mjs` from Task 5F. This module must use the user's authenticated ChatGPT browser profile and operate like the existing Flow automation style: visible browser, real clicks, keystroke input, wait, download.

```js
await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded" });
await page.getByRole("textbox").click();
await page.keyboard.type(thumbnailPrompt.image_prompt, { delay: 18 });
await page.getByRole("button", { name: /첨부|추가|add|attach|\+/i }).first().click();
await page.getByText(/이미지 만들기|Create image|Make image|Image/i).first().click();
await page.keyboard.press("Enter");
```

Notes for implementation:

- This is the primary thumbnail image source because Google Flow often renders Korean text poorly in generated images.
- The user must authenticate ChatGPT once in the app-managed Chrome/Playwright profile.
- Hermes must never ask for or store ChatGPT cookies, session tokens, or passwords.
- The prompt should ask ChatGPT to render the short Korean hook headline directly inside the image because ChatGPT handles Korean text better than Google Flow.
- If the generated Korean headline is distorted or unreadable, Hermes repairs the headline locally with `sharp` as a fallback.
- It should save screenshots on failure under the job output folder so the user can see whether ChatGPT was logged out, blocked, or the UI changed.

- [ ] **Step 5: Add ChatGPT authentication and failure policy**

ChatGPT thumbnail generation is allowed only after explicit user authentication:

```text
ChatGPT profile status: Not connected | Connected | Needs login
Open ChatGPT Login
Test ChatGPT Thumbnail Tool
```

Implementation rule:

```text
Do not bypass login, CAPTCHA, rate limits, or account checks.
If ChatGPT asks the user to verify, pause and show "ChatGPT login/verification needed".
Do not retry indefinitely.
Do not call OpenAI paid image APIs for thumbnail generation.
The default thumbnail path is ChatGPT authenticated browser generation.
```

- [ ] **Step 6: Update `youtube-thumbnail.mjs` to orchestrate thumbnail modes**

Modify `pipeline/youtube-thumbnail.mjs` so it supports:

```text
thumbnailMode=chatgpt-auth
thumbnailMode=frame-fallback
thumbnailMode=auto
```

Required behavior:

- `auto`: try ChatGPT authenticated browser image generation first, then frame fallback.
- `chatgpt-auth`: use authenticated ChatGPT browser image generation only.
- `frame-fallback`: extract a frame from the locally rendered mp4 with ffmpeg and compose headline with `sharp`.
- Read `thumbnail_prompt.json` created by `youtube-thumbnail-prompt.mjs`.
- Write `thumbnail-source.png` for the generated image.
- Render final `thumbnail.jpg` at exactly 1280x720.
- Preserve ChatGPT's generated Korean `hook_headline` when it is readable.
- Overlay or repair `hook_headline` with `sharp` only when OCR/manual review marks the generated Korean headline as distorted, missing, or unreadable.
- Keep safe zones so text is not hidden by YouTube UI.
- Store `thumbnail_method`, `hook_headline`, and `curiosity_gap` in job metadata.

- [ ] **Step 7: Update UI controls**

Add thumbnail controls to the `Create` tab:

```text
Thumbnail mode: Auto | ChatGPT authenticated | Frame fallback
Thumbnail hook style: News shock | Smart curiosity | Risk warning | Clean explainer
Use title/script context: on by default
Use ChatGPT profile: on by default
Open ChatGPT Login
Test ChatGPT Image Tool
Regenerate thumbnail
Preview prompt
Preview thumbnail
```

Default choices:

```json
{
  "thumbnailMode": "auto",
  "thumbnailHookStyle": "smart-curiosity",
  "thumbnailUsesScriptContext": true,
  "useChatGptThumbnail": true
}
```

- [ ] **Step 8: Add Telegram thumbnail commands**

Telegram should support:

```text
/thumb_regen <jobId>
/thumb_prompt <jobId>
```

Expected behavior:

- `/thumb_prompt` returns the hook headline, curiosity gap, and short prompt summary.
- `/thumb_regen` regenerates only the thumbnail without rerendering the full video.
- The final upload uses the latest approved thumbnail.

- [ ] **Step 9: Run thumbnail pipeline smoke test**

Run:

```powershell
node .\scripts\check-chatgpt-thumbnail-pipeline.mjs
node .\scripts\check-youtube-upload-pipeline.mjs
```

Expected: PASS.

---

## Task 6: Build Installer

**Files:**
- Modify: `package.json`
- Create: `scripts/check-electron-build-output.mjs`

- [ ] **Step 1: Add build output check**

Create `scripts/check-electron-build-output.mjs`:

```js
#!/usr/bin/env node
import { existsSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";

assert.ok(existsSync("dist-electron"), "dist-electron should exist after packaging");
const files = readdirSync("dist-electron");
assert.ok(files.some((file) => /Hermes.*Setup.*\.exe$/i.test(file) || /Hermes.*\.exe$/i.test(file)), "Windows installer exe should exist");
console.log(JSON.stringify({ ok: true, checked: "electron-build-output", files }));
```

- [ ] **Step 2: Build installer**

Run:

```powershell
npm.cmd run electron:pack
```

Expected: `dist-electron` contains a Windows installer executable.

- [ ] **Step 3: Verify build output**

Run:

```powershell
node .\scripts\check-electron-build-output.mjs
```

Expected: PASS.

---

## Task 7: Fresh Computer Acceptance Test

**Files:**
- Modify: `docs/ELECTRON_INSTALL_GUIDE.md`

- [ ] **Step 1: Install on a second Windows computer**

Copy the installer from:

```text
C:\Users\amd\hermes\dist-electron
```

Install it on the second computer.

- [ ] **Step 2: Complete first-run setup**

In Hermes Desktop:

```text
Telegram Bot Token: paste target bot token
Allowed Chat/User ID: paste user/chat id
OpenRouter API Key: paste key
Supertonic TTS Root: select copied/installed TTS root
Output Directory: choose local writable folder
YouTube OAuth Client Secret: copy client_secrets.json into app data when upload is enabled
```

Telegram fields may be empty for app-only use.

- [ ] **Step 3: Run health check**

Expected:

```json
{
  "ok": true
}
```

Every check should show `ok: true`.

- [ ] **Step 4: Start worker**

Click `Start Worker`.

Expected:

```json
{
  "running": true,
  "pid": 12345
}
```

- [ ] **Step 5: Log in to Google Flow**

When Chrome opens, log in to Google Flow once.

Expected:

```text
Google Flow project page opens without account/auth error.
```

- [ ] **Step 6: Run app-native keyword test**

In the `Create` tab:

```text
Source mode: Keyword
Source value: 최신 AI 뉴스
Script length: 60초
Voice: M1
Subtitle style: Bold Shorts
Character consistency: Consistent Presenter
```

Click `Generate Final Video`.

Expected:

```text
Hermes generates the script, scenes, Flow media, TTS, subtitles, and one final mp4.
The final mp4 appears in the app output preview and job history.
No Telegram configuration is required.
```

- [ ] **Step 7: Run app-native URL test**

In the `Create` tab:

```text
Source mode: URL
Source value: paste a news article URL
Script length: 90초
Voice: F1
Subtitle style: Clean News
Character consistency: No Person
```

Expected:

```text
Hermes summarizes and adapts the URL content into a new narration, generates scene prompts from each scene's context, renders TTS/subtitles, and creates one final mp4.
The final video duration is not shorter than the narration duration.
```

- [ ] **Step 8: Send optional Telegram test command**

Send:

```text
/yt 최신 ai 뉴스 길이=60초 음성=M1 자막=bold
```

Expected:

```text
Hermes generates scenes, renders TTS/subtitles/video, and sends one final mp4 only.
No individual scene videos are sent.
The job also appears in the desktop app job history.
```

- [ ] **Step 9: Run YouTube OAuth setup test**

In the `Settings` tab:

```text
Upload Mode: On
YouTube OAuth client_secrets.json: select/copy file
Run YouTube Auth
```

Expected:

```text
Google browser consent opens once.
After consent, youtube_token.json is saved under the Hermes app data directory.
Health check shows YouTube upload auth as ok.
```

- [ ] **Step 10: Run ChatGPT thumbnail authentication test**

In the `Settings` tab:

```text
Thumbnail Provider: ChatGPT authenticated browser
Open ChatGPT Login
Test ChatGPT Image Tool
```

Expected:

```text
ChatGPT opens in an app-managed browser profile.
The user logs in manually if needed.
Hermes does not ask for or store ChatGPT cookies, session tokens, or passwords.
The test opens the + menu, selects 이미지 만들기, and confirms that the image tool is reachable.
If ChatGPT asks for verification, Hermes pauses and shows ChatGPT login/verification needed.
```

- [ ] **Step 11: Run guarded upload test**

Use a completed app-native video job:

```text
Upload after render: on
Privacy: Private
AI synthetic media disclosure: on
Auto thumbnail: on
Thumbnail mode: Auto
Thumbnail hook style: Smart curiosity
Use title/script context: on
ChatGPT thumbnail profile: Connected
Require approval before upload: on
```

Click `Approve Upload`.

Expected:

```text
Pre-upload review passes.
Thumbnail prompt uses the final title and script context.
Hermes types the thumbnail prompt into ChatGPT with keystroke-style input.
Hermes clicks + and selects 이미지 만들기 before submitting the prompt.
Thumbnail output includes a clear hook concept instead of a generic frame.
ChatGPT attempts to render the short Korean hook headline directly inside the image.
If the Korean headline is distorted or unreadable, Hermes repairs it locally with sharp.
Video upload uses resumable upload.
Upload metadata includes status.containsSyntheticMedia=true.
Thumbnail is attached after video_id is returned.
Job state becomes uploaded and stores the YouTube watch URL.
```

---

## Risks And Mitigations

- **Google Flow login cannot be bundled.**
  - Mitigation: first-run login wizard and persistent Chrome profile under app data.
- **Supertonic TTS is large and Python-based.**
  - Mitigation: first release uses external TTS path; later release can bundle a portable runtime.
- **Hard-coded paths currently exist.**
  - Mitigation: Task 1 moves runtime paths to env/config.
- **Telegram/OpenRouter secrets must not ship inside installer.**
  - Mitigation: config wizard writes user-specific secrets to app data after install.
- **Current bot file is large.**
  - Mitigation: Electron wraps it first; later refactor can split workflow engine into modules.
- **Two control surfaces can drift apart.**
  - Mitigation: app and Telegram both submit the same `YouTubeJobRequest` schema to one shared runner.
- **User-selected voice and subtitle options can desync audio/subtitles.**
  - Mitigation: render-options JSON is written per job, TTS durations are measured, and final render fails if video is shorter than narration.
- **Character appearance can become inconsistent across Flow scenes.**
  - Mitigation: create one character profile per job and inject it verbatim into every scene prompt.
- **YouTube API projects may be unverified or quota-limited.**
  - Mitigation: default uploads to `private`, expose OAuth/permission/quota failures clearly, and keep manual retry controls.
- **Accidental public upload would be high impact.**
  - Mitigation: upload is off by default, approval is required for first release, and `privacyStatus` defaults to `private`.
- **OAuth token files are sensitive.**
  - Mitigation: store `client_secrets.json` and `youtube_token.json` only under user app data, never in the installer or repository, and exclude them from logs.
- **Thumbnail generation may choose a weak image or distorted Korean text.**
  - Mitigation: use authenticated ChatGPT browser image generation from title/script context as the primary path, ask ChatGPT to render a short Korean hook headline directly, preview/regenerate before approval, and repair distorted/missing Korean headline text locally with `sharp` only when needed.
- **ChatGPT web UI can change, require login, or ask for verification.**
  - Mitigation: require explicit user authentication in an app-managed browser profile, never store cookies/tokens/passwords directly, save failure screenshots, pause for user verification instead of bypassing it, and fall back to a locally extracted frame plus `sharp` headline overlay.

## Self-Review

- Spec coverage: installer, first-run setup, app-native keyword/URL creation, optional Telegram mode, script length selection, voice selection, subtitle style selection, Chrome/Flow login, optional ChatGPT thumbnail login, TTS, worker lifecycle, final video output, hook-driven ChatGPT-authenticated thumbnail generation, Node.js-native YouTube OAuth/upload, guarded YouTube upload, OAuth refresh, resumable upload, and second-computer validation are covered.
- Unfinished-token scan: no unfinished planning tokens remain.
- Type consistency: config fields are consistently named `telegramBotToken`, `allowFrom`, `openRouterKey`, `ttsRoot`, and `outputDir`; job option fields are consistently named `sourceType`, `sourceValue`, `scriptLengthPreset`, `voiceId`, `speechSpeed`, and `subtitleStyleId`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-24-electron-desktop-installer.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, faster iteration.
2. **Inline Execution** - Execute tasks in this session using checkpoints.
