# Hermes Local Studio Complete Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 완성도 높은 로컬 Hermes YouTube Studio를 먼저 만들고, 그 검증된 로컬 앱을 기준으로 설치본을 생성한다.

**Architecture:** Electron 앱을 “인증/설정/제작/검수/업로드”가 분리된 로컬 스튜디오로 재구성한다. 모든 인증은 버튼으로 시작하고, 인증 세션과 토큰은 `%APPDATA%/hermes` 아래에 영속 저장해 다음 실행에서도 재사용한다. 영상 생성은 고정 6씬이 아니라 대본 문장/목표 길이/장면 최소 길이에 따라 동적으로 씬을 나누고, Flow/ChatGPT/YouTube 업로드는 같은 `YouTubeJobRequest`와 job store를 공유한다.

**Tech Stack:** Electron, Node.js ESM, Playwright/Chrome CDP, Google OAuth `googleapis`, existing Google Flow automation, ChatGPT browser automation, Supertonic TTS, `ffmpeg-static`, `sharp`, appData JSON stores, `electron-builder`.

---

## Product Principle

설치본은 마지막 산출물이다. 먼저 `npm run electron:dev`와 `dist-electron/win-unpacked/Hermes YouTube Studio.exe`에서 같은 기능이 안정적으로 돌아가야 한다. 설치본은 이 로컬 완성본을 포장만 하는 단계로 둔다.

현재 앱은 테스트 영상 생성용으로 동작하지만 아직 완성 제품은 아니다. 특히 `electron/main.mjs` 안에 테스트용 synthetic scene generation과 깨진 한글 대본 샘플이 남아 있으므로, 실제 완성본에서는 이를 제거하고 공용 workflow service로 교체해야 한다.

## Target User Flow

1. 사용자가 앱을 연다.
2. `Settings > Authentication`에서 버튼을 눌러 필요한 인증을 한다.
3. 앱이 인증 상태를 녹색/노란색/빨간색으로 표시한다.
4. 사용자는 `Create`에서 키워드 또는 URL을 입력한다.
5. 사용자는 대본 목표 길이를 프리셋 또는 수동 초 단위로 입력한다.
6. 사용자는 음성 프리셋, 자막 스타일, 글자 크기, 테두리, 그림자, 위치를 선택한다.
7. 자막 미리보기 패널에서 즉시 스타일을 본다.
8. 사용자가 `Generate Final Video`를 누르면 실제 기사/키워드 기반 대본이 생성된다.
9. 대본 문장 수와 목표 길이에 따라 씬이 자동 분할된다.
10. 각 씬은 문장 맥락과 핵심 키워드를 반영한 Flow 프롬프트로 영상화된다.
11. TTS, 자막, ffmpeg 렌더를 거쳐 최종 영상이 생성된다.
12. 썸네일은 ChatGPT 인증 세션을 사용해 생성한다.
13. 사용자는 영상/썸네일/메타데이터를 검수하고 승인한다.
14. YouTube 업로드 인증이 되어 있으면 승인 후 업로드한다.
15. 이후 앱을 다시 열어도 인증과 설정이 유지된다.

## File Structure

- Create: `electron/services/path-resolver.mjs`
  - dev, packaged, appData, browser profile, output, resource paths를 단일 책임으로 계산한다.
- Create: `electron/services/config-store.mjs`
  - `%APPDATA%/hermes/config.json`을 읽고 쓴다.
- Create: `electron/services/auth-service.mjs`
  - ChatGPT, Gemini, Google Flow, YouTube OAuth 인증 상태와 인증 시작 버튼 IPC를 관리한다.
- Create: `electron/services/browser-profile-service.mjs`
  - 인증용 Chrome/Playwright persistent profile 폴더를 만든다.
- Create: `electron/services/youtube-job-service.mjs`
  - Electron UI 요청을 실제 `runYouTubeJob` 워크플로우에 연결한다.
- Create: `electron/services/script-planner.mjs`
  - 목표 길이, 수동 길이, 문장 수를 기준으로 씬 수와 씬별 내레이션을 계산한다.
- Create: `electron/services/voice-presets.mjs`
  - 30대/60대, 남/여, 아나운서/저음/고음 음성 프리셋을 정의한다.
- Create: `electron/services/subtitle-presets.mjs`
  - 자막 스타일, 크기, 테두리, 그림자, 위치, 색상 프리셋과 사용자 커스텀 값을 정의한다.
- Create: `electron/services/subtitle-preview.mjs`
  - UI 미리보기와 ffmpeg ASS 스타일 값을 같은 데이터에서 생성한다.
- Create: `electron/services/job-store.mjs`
  - 작업 기록, 상태, 최종 영상, 썸네일, 업로드 승인 상태를 저장한다.
- Create: `pipeline/youtube-auth.mjs`
  - YouTube OAuth 토큰 생성/갱신/저장을 담당한다.
- Create: `pipeline/youtube-upload.mjs`
  - YouTube resumable upload와 thumbnail binding을 담당한다.
- Create: `automation/chatgpt-auth.mjs`
  - ChatGPT 인증 버튼이 열 브라우저 프로필을 관리한다.
- Create: `automation/flow-auth.mjs`
  - Google Flow 인증 버튼이 열 브라우저 프로필을 관리한다.
- Create: `automation/gemini-auth.mjs`
  - Gemini 인증 버튼이 열 브라우저 프로필을 관리한다.
- Modify: `electron/main.mjs`
  - 현재 테스트 렌더 직접 구현을 제거하고 service IPC만 등록한다.
- Modify: `electron/preload.mjs`
  - 인증/설정/작업/미리보기 API를 노출한다.
- Modify: `electron/renderer/index.html`
  - Settings/Auth/Create/Preview/Jobs 탭 구조를 만든다.
- Modify: `electron/renderer/app.js`
  - 인증 버튼, 동적 옵션, 자막 미리보기, 작업 실행 UI 상태를 연결한다.
- Modify: `electron/renderer/styles.css`
  - 제품형 Studio UI로 정리한다.
- Modify: `youtube-job-schema.mjs`
  - 수동 길이, 동적 씬, 음성 프리셋, 자막 커스텀 옵션을 스키마에 추가한다.
- Modify: `youtube-workflow.mjs`
  - 대본/씬/Flow 생성이 Electron service에서도 동일하게 호출되도록 분리한다.
- Modify: `scripts/render-youtube-with-tts.mjs`
  - subtitle preset/custom style과 render options를 실제 ffmpeg 필터에 반영한다.
- Modify: `scripts/make-scenes-tts.py`
  - voice preset과 speed를 render-options에서 읽는다.
- Create: `scripts/check-local-studio-product.mjs`
  - 인증 버튼, 경로, 수동 길이, 음성 프리셋, 자막 미리보기, dynamic scenes 정적 검증.

---

## Task 1: Runtime Paths And Persistent Config

**Files:**
- Create: `electron/services/path-resolver.mjs`
- Create: `electron/services/config-store.mjs`
- Modify: `electron/main.mjs`
- Test: `scripts/check-local-studio-product.mjs`

- [ ] **Step 1: Write path/config smoke test**

Create `scripts/check-local-studio-product.mjs` with:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pathResolver = readFileSync(resolve(root, "electron/services/path-resolver.mjs"), "utf8");
const configStore = readFileSync(resolve(root, "electron/services/config-store.mjs"), "utf8");
const main = readFileSync(resolve(root, "electron/main.mjs"), "utf8");

assert.match(pathResolver, /getRuntimePaths/, "path resolver should export getRuntimePaths");
assert.match(pathResolver, /app\.getPath\("userData"\)/, "packaged app should use userData");
assert.match(pathResolver, /chatgpt-profile/, "should define ChatGPT profile path");
assert.match(pathResolver, /flow-profile/, "should define Google Flow profile path");
assert.match(pathResolver, /gemini-profile/, "should define Gemini profile path");
assert.match(configStore, /loadConfig/, "config store should export loadConfig");
assert.match(configStore, /saveConfig/, "config store should export saveConfig");
assert.match(main, /getRuntimePaths/, "main should use centralized path resolver");

console.log(JSON.stringify({ ok: true, checked: "local-studio-product" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scripts\check-local-studio-product.mjs
```

Expected: FAIL because `electron/services/path-resolver.mjs` does not exist.

- [ ] **Step 3: Add runtime path resolver**

Create `electron/services/path-resolver.mjs`:

```js
import { app } from "electron";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getRuntimePaths() {
  const appRoot = resolve(__dirname, "..", "..");
  const userData = app.getPath("userData");
  const runtimeRoot = app.isPackaged ? userData : appRoot;
  const resourcesRoot = app.isPackaged ? process.resourcesPath : appRoot;
  const unpackedRoot = app.isPackaged ? join(process.resourcesPath, "app.asar.unpacked") : appRoot;

  return {
    appRoot,
    userData,
    runtimeRoot,
    resourcesRoot,
    unpackedRoot,
    outputDir: join(runtimeRoot, "outputs"),
    configPath: join(userData, "config.json"),
    jobsDir: join(userData, "jobs"),
    chatgptProfileDir: join(userData, "browser-profiles", "chatgpt-profile"),
    flowProfileDir: join(userData, "browser-profiles", "flow-profile"),
    geminiProfileDir: join(userData, "browser-profiles", "gemini-profile"),
    renderScriptPath: app.isPackaged
      ? join(unpackedRoot, "scripts", "render-youtube-with-tts.mjs")
      : join(appRoot, "scripts", "render-youtube-with-tts.mjs"),
  };
}
```

- [ ] **Step 4: Add config store**

Create `electron/services/config-store.mjs`:

```js
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const DEFAULT_CONFIG = {
  version: 1,
  ttsRoot: "C:/Users/amd/supertonic3-local-tts-20260517-r4",
  auth: {
    chatgpt: { status: "unknown" },
    gemini: { status: "unknown" },
    googleFlow: { status: "unknown" },
    youtube: { status: "unknown" },
  },
  defaults: {
    scriptLengthMode: "preset",
    scriptLengthPreset: "standard",
    customDurationSeconds: 90,
    voiceId: "male_30_announcer",
    subtitleStyleId: "bold_shorts",
  },
};

export async function loadConfig(configPath) {
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8"));
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      auth: { ...DEFAULT_CONFIG.auth, ...(parsed.auth || {}) },
      defaults: { ...DEFAULT_CONFIG.defaults, ...(parsed.defaults || {}) },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(configPath, config) {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
  return config;
}
```

- [ ] **Step 5: Wire main to path resolver**

Modify `electron/main.mjs` to import and use:

```js
import { getRuntimePaths } from "./services/path-resolver.mjs";
import { loadConfig, saveConfig } from "./services/config-store.mjs";

const paths = getRuntimePaths();
const OUTPUT_DIR = process.env.HERMES_OUTPUT_DIR || paths.outputDir;
const RENDER_SCRIPT = paths.renderScriptPath;
```

Register config IPC:

```js
ipcMain.handle("config:get", async () => loadConfig(paths.configPath));
ipcMain.handle("config:save", async (_event, config) => saveConfig(paths.configPath, config));
```

- [ ] **Step 6: Run checks**

Run:

```powershell
node .\scripts\check-local-studio-product.mjs
npm.cmd run check
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```powershell
git add electron/services/path-resolver.mjs electron/services/config-store.mjs electron/main.mjs scripts/check-local-studio-product.mjs package.json
git commit -m "feat: add persistent local studio runtime config"
```

---

## Task 2: Authentication Buttons And Persistent Sessions

**Files:**
- Create: `electron/services/auth-service.mjs`
- Create: `automation/chatgpt-auth.mjs`
- Create: `automation/flow-auth.mjs`
- Create: `automation/gemini-auth.mjs`
- Modify: `electron/main.mjs`
- Modify: `electron/preload.mjs`
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Test: `scripts/check-local-studio-product.mjs`

- [ ] **Step 1: Extend static test for auth IPC and UI**

Append to `scripts/check-local-studio-product.mjs`:

```js
const preload = readFileSync(resolve(root, "electron/preload.mjs"), "utf8");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const renderer = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const authService = readFileSync(resolve(root, "electron/services/auth-service.mjs"), "utf8");

for (const id of ["chatgpt", "gemini", "googleFlow", "youtube"]) {
  assert.match(html, new RegExp(`auth-${id}`), `${id} auth button should exist`);
}
assert.match(preload, /authStart/, "preload should expose authStart");
assert.match(preload, /authStatus/, "preload should expose authStatus");
assert.match(renderer, /renderAuthStatus/, "renderer should render auth status");
assert.match(authService, /startAuth/, "auth service should export startAuth");
assert.match(authService, /getAuthStatus/, "auth service should export getAuthStatus");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scripts\check-local-studio-product.mjs
```

Expected: FAIL because `auth-service.mjs` does not exist.

- [ ] **Step 3: Add auth service**

Create `electron/services/auth-service.mjs`:

```js
import { spawn } from "node:child_process";

export const AUTH_TARGETS = {
  chatgpt: { label: "ChatGPT", url: "https://chatgpt.com/" },
  gemini: { label: "Gemini", url: "https://gemini.google.com/" },
  googleFlow: { label: "Google Flow", url: "https://labs.google/fx/ko/tools/flow" },
  youtube: { label: "YouTube Upload", url: "youtube-oauth" },
};

export function getAuthStatus(config = {}) {
  return {
    chatgpt: config.auth?.chatgpt || { status: "unknown" },
    gemini: config.auth?.gemini || { status: "unknown" },
    googleFlow: config.auth?.googleFlow || { status: "unknown" },
    youtube: config.auth?.youtube || { status: "unknown" },
  };
}

export function openPersistentChrome({ chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe", profileDir, url }) {
  const child = spawn(chromePath, [
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--new-window",
    url,
  ], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
  return { ok: true, pid: child.pid, profileDir, url };
}

export async function startAuth(target, { config, paths }) {
  if (!AUTH_TARGETS[target]) throw new Error(`Unknown auth target: ${target}`);
  if (target === "youtube") {
    return { ok: false, target, message: "YouTube OAuth is implemented in Task 9." };
  }
  const profileDir = target === "chatgpt"
    ? paths.chatgptProfileDir
    : target === "gemini"
      ? paths.geminiProfileDir
      : paths.flowProfileDir;
  const result = openPersistentChrome({
    chromePath: config.chromePath || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    profileDir,
    url: AUTH_TARGETS[target].url,
  });
  return { ...result, target, status: "auth-window-opened" };
}
```

- [ ] **Step 4: Add auth IPC to main/preload**

In `electron/main.mjs`:

```js
import { getAuthStatus, startAuth } from "./services/auth-service.mjs";

ipcMain.handle("auth:status", async () => {
  const config = await loadConfig(paths.configPath);
  return getAuthStatus(config);
});

ipcMain.handle("auth:start", async (_event, target) => {
  const config = await loadConfig(paths.configPath);
  return startAuth(target, { config, paths });
});
```

In `electron/preload.mjs` expose:

```js
authStatus: () => ipcRenderer.invoke("auth:status"),
authStart: (target) => ipcRenderer.invoke("auth:start", target),
```

- [ ] **Step 5: Add Settings/Auth UI**

In `electron/renderer/index.html`, add an auth panel:

```html
<section class="panel auth-panel">
  <div class="panel-header">
    <h3>Authentication</h3>
    <span id="authSummary">Not checked</span>
  </div>
  <div class="auth-grid">
    <button id="auth-chatgpt" type="button">Authenticate ChatGPT</button>
    <button id="auth-gemini" type="button">Authenticate Gemini</button>
    <button id="auth-googleFlow" type="button">Authenticate Google Flow</button>
    <button id="auth-youtube" type="button">Authenticate YouTube Upload</button>
  </div>
  <pre id="authStatusBox"></pre>
</section>
```

In `electron/renderer/app.js`:

```js
async function renderAuthStatus() {
  const status = await window.hermes.authStatus();
  document.querySelector("#authStatusBox").textContent = JSON.stringify(status, null, 2);
  document.querySelector("#authSummary").textContent = "Checked";
}

for (const target of ["chatgpt", "gemini", "googleFlow", "youtube"]) {
  document.querySelector(`#auth-${target}`)?.addEventListener("click", async () => {
    appendLog(`Starting ${target} authentication`);
    const result = await window.hermes.authStart(target);
    appendLog(`${target} authentication`, result);
    await renderAuthStatus();
  });
}
```

- [ ] **Step 6: Run checks**

Run:

```powershell
node .\scripts\check-local-studio-product.mjs
npm.cmd run check
```

Expected: PASS.

- [ ] **Step 7: Manual validation**

Run:

```powershell
npm run electron:dev
```

Click:
- `Authenticate ChatGPT`
- `Authenticate Gemini`
- `Authenticate Google Flow`

Expected:
- Chrome windows open with persistent profile folders under `%APPDATA%/hermes/browser-profiles`.
- Closing and reopening the app does not delete those profiles.

- [ ] **Step 8: Commit**

```powershell
git add electron automation scripts
git commit -m "feat: add persistent authentication buttons"
```

---

## Task 3: Custom Script Length And Dynamic Scene Planning

**Files:**
- Create: `electron/services/script-planner.mjs`
- Modify: `youtube-job-schema.mjs`
- Modify: `youtube-workflow.mjs`
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Test: `scripts/check-local-studio-product.mjs`

- [ ] **Step 1: Add planner tests**

Append to `scripts/check-local-studio-product.mjs`:

```js
const planner = readFileSync(resolve(root, "electron/services/script-planner.mjs"), "utf8");
const schema = readFileSync(resolve(root, "youtube-job-schema.mjs"), "utf8");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");

assert.match(planner, /planScenesFromScript/, "planner should export planScenesFromScript");
assert.match(planner, /customDurationSeconds/, "planner should support manual duration");
assert.match(schema, /customDurationSeconds/, "job schema should accept manual duration");
assert.match(schema, /sceneStrategy/, "job schema should accept dynamic scene strategy");
assert.match(workflow, /planScenesFromScript/, "workflow should use dynamic scene planner");
```

- [ ] **Step 2: Create script planner**

Create `electron/services/script-planner.mjs`:

```js
export function splitKoreanSentences(script = "") {
  return String(script)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？]|다\.|요\.|죠\.)\s+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function targetSceneCount({ sentenceCount, targetSeconds }) {
  const byTime = Math.max(3, Math.ceil(Number(targetSeconds || 60) / 12));
  const bySentence = Math.max(3, Math.ceil(Number(sentenceCount || 1) / 2));
  return Math.min(18, Math.max(byTime, bySentence));
}

export function planScenesFromScript({ script, title, targetSeconds, customDurationSeconds, characterProfile }) {
  const seconds = Number(customDurationSeconds || targetSeconds || 60);
  const sentences = splitKoreanSentences(script);
  const count = targetSceneCount({ sentenceCount: sentences.length, targetSeconds: seconds });
  const perScene = Math.max(1, Math.ceil(sentences.length / count));
  const scenes = [];

  for (let index = 0; index < count; index += 1) {
    const narration = sentences.slice(index * perScene, (index + 1) * perScene).join(" ") || script;
    scenes.push({
      order: index + 1,
      narration,
      duration_seconds: Math.max(5, Math.round(seconds / count)),
      image_prompt: [
        "9:16 cinematic YouTube shorts scene.",
        `Title: ${title}.`,
        `Narration context: ${narration}.`,
        characterProfile ? `Consistent character: ${characterProfile}.` : "",
        "No subtitles, no readable text, no logos, no watermarks.",
      ].filter(Boolean).join(" "),
    });
  }

  return scenes;
}
```

- [ ] **Step 3: Extend schema**

In `youtube-job-schema.mjs`, add options:

```js
customDurationSeconds: 90,
sceneStrategy: "sentence-proportional",
minSceneSeconds: 5,
maxSceneSeconds: 12,
```

Validation:

```js
options.customDurationSeconds = Math.max(15, Math.min(600, Number(options.customDurationSeconds || 90)));
if (!["preset", "sentence-proportional"].includes(options.sceneStrategy)) {
  throw new Error(`Unknown sceneStrategy: ${options.sceneStrategy}`);
}
```

- [ ] **Step 4: Wire workflow planner**

In `youtube-workflow.mjs`, import:

```js
import { planScenesFromScript } from "./electron/services/script-planner.mjs";
```

After draft normalization, replace scenes when strategy is dynamic:

```js
if (job.options.sceneStrategy === "sentence-proportional") {
  draft.scenes = planScenesFromScript({
    script: draft.script,
    title: draft.title,
    targetSeconds: renderOptions.targetSeconds,
    customDurationSeconds: job.options.customDurationSeconds,
    characterProfile: draft.character_profile,
  });
}
```

- [ ] **Step 5: Add UI controls**

In `electron/renderer/index.html`, add:

```html
<div class="field-group">
  <label for="scriptLengthMode">대본 길이</label>
  <select id="scriptLengthMode">
    <option value="preset">프리셋</option>
    <option value="custom">수동 입력</option>
  </select>
</div>
<div class="field-group">
  <label for="customDurationSeconds">수동 길이(초)</label>
  <input id="customDurationSeconds" type="number" min="15" max="600" value="120">
</div>
```

In `electron/renderer/app.js`, include:

```js
scriptLengthMode: document.querySelector("#scriptLengthMode").value,
customDurationSeconds: Number(document.querySelector("#customDurationSeconds").value || 90),
sceneStrategy: "sentence-proportional",
```

- [ ] **Step 6: Run checks and dynamic scene CLI smoke**

Run:

```powershell
node .\scripts\check-local-studio-product.mjs
npm.cmd run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add electron/services/script-planner.mjs youtube-job-schema.mjs youtube-workflow.mjs electron/renderer scripts/check-local-studio-product.mjs
git commit -m "feat: add custom duration and dynamic scene planning"
```

---

## Task 4: Professional Voice Catalog

**Files:**
- Create: `electron/services/voice-presets.mjs`
- Modify: `youtube-job-schema.mjs`
- Modify: `scripts/make-scenes-tts.py`
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Test: `scripts/check-local-studio-product.mjs`

- [ ] **Step 1: Create voice preset catalog**

Create `electron/services/voice-presets.mjs`:

```js
export const VOICE_PRESETS = [
  { id: "male_30_announcer", label: "30대 남성 아나운서", gender: "male", age: 30, tone: "announcer", engineVoice: "M1", speed: 1.06, pitch: 0 },
  { id: "female_30_announcer", label: "30대 여성 아나운서", gender: "female", age: 30, tone: "announcer", engineVoice: "F1", speed: 1.06, pitch: 0 },
  { id: "male_30_low", label: "30대 남성 저음", gender: "male", age: 30, tone: "low", engineVoice: "M1", speed: 1.0, pitch: -2 },
  { id: "female_30_low", label: "30대 여성 저음", gender: "female", age: 30, tone: "low", engineVoice: "F1", speed: 1.0, pitch: -2 },
  { id: "male_30_high", label: "30대 남성 고음", gender: "male", age: 30, tone: "high", engineVoice: "M2", speed: 1.08, pitch: 2 },
  { id: "female_30_high", label: "30대 여성 고음", gender: "female", age: 30, tone: "high", engineVoice: "F1", speed: 1.08, pitch: 2 },
  { id: "male_60_announcer", label: "60대 남성 아나운서", gender: "male", age: 60, tone: "announcer", engineVoice: "M1", speed: 0.96, pitch: -1 },
  { id: "female_60_announcer", label: "60대 여성 아나운서", gender: "female", age: 60, tone: "announcer", engineVoice: "F1", speed: 0.96, pitch: -1 },
  { id: "male_60_low", label: "60대 남성 저음", gender: "male", age: 60, tone: "low", engineVoice: "M1", speed: 0.94, pitch: -3 },
  { id: "female_60_low", label: "60대 여성 저음", gender: "female", age: 60, tone: "low", engineVoice: "F1", speed: 0.94, pitch: -3 },
  { id: "male_60_high", label: "60대 남성 고음", gender: "male", age: 60, tone: "high", engineVoice: "M2", speed: 0.98, pitch: 1 },
  { id: "female_60_high", label: "60대 여성 고음", gender: "female", age: 60, tone: "high", engineVoice: "F1", speed: 0.98, pitch: 1 },
];

export function getVoicePreset(id) {
  return VOICE_PRESETS.find((item) => item.id === id) || VOICE_PRESETS[0];
}
```

- [ ] **Step 2: Wire schema and renderer**

Add all preset ids to `youtube-job-schema.mjs` voice validation. In UI, replace hardcoded voice options with `VOICE_PRESETS` returned from IPC:

```js
ipcMain.handle("presets:voices", async () => VOICE_PRESETS);
```

Expose:

```js
getVoicePresets: () => ipcRenderer.invoke("presets:voices"),
```

Renderer:

```js
async function populateVoicePresets() {
  const voices = await window.hermes.getVoicePresets();
  const select = document.querySelector("#voiceId");
  select.replaceChildren(...voices.map((voice) => {
    const option = document.createElement("option");
    option.value = voice.id;
    option.textContent = voice.label;
    return option;
  }));
}
```

- [ ] **Step 3: Pass preset to TTS**

In `scripts/make-scenes-tts.py`, read `render-options.json`:

```python
render_options_path = job_dir / "render-options.json"
render_options = json.loads(render_options_path.read_text(encoding="utf-8")) if render_options_path.exists() else {}
voice = render_options.get("engineVoice") or render_options.get("voiceId") or "M1"
speed = float(render_options.get("speechSpeed") or 1.08)
```

Use:

```python
voice=voice,
speed=speed,
```

- [ ] **Step 4: Add checks**

Append to `scripts/check-local-studio-product.mjs`:

```js
const voicePresets = readFileSync(resolve(root, "electron/services/voice-presets.mjs"), "utf8");
for (const id of ["male_30_announcer", "female_30_announcer", "male_60_low", "female_60_high"]) {
  assert.match(voicePresets, new RegExp(id), `${id} should be defined`);
}
```

- [ ] **Step 5: Run checks and commit**

```powershell
node .\scripts\check-local-studio-product.mjs
npm.cmd run check
git add electron/services/voice-presets.mjs youtube-job-schema.mjs scripts/make-scenes-tts.py electron
git commit -m "feat: add professional voice catalog"
```

---

## Task 5: Subtitle Style Designer With Live Preview

**Files:**
- Create: `electron/services/subtitle-presets.mjs`
- Create: `electron/services/subtitle-preview.mjs`
- Modify: `scripts/render-youtube-with-tts.mjs`
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Modify: `electron/renderer/styles.css`
- Test: `scripts/check-local-studio-product.mjs`

- [ ] **Step 1: Add subtitle preset service**

Create `electron/services/subtitle-presets.mjs`:

```js
export const SUBTITLE_PRESETS = [
  { id: "bold_shorts", label: "Bold Shorts", fontSize: 54, outline: 5, shadow: 2, marginV: 150, color: "#ffffff", outlineColor: "#000000", position: "bottom" },
  { id: "clean_news", label: "Clean News", fontSize: 42, outline: 3, shadow: 1, marginV: 130, color: "#ffffff", outlineColor: "#111111", position: "bottom" },
  { id: "caption_box", label: "Caption Box", fontSize: 40, outline: 0, shadow: 0, marginV: 120, color: "#111111", outlineColor: "#ffffff", position: "bottom" },
  { id: "top_hook", label: "Top Hook", fontSize: 48, outline: 4, shadow: 2, marginV: 120, color: "#ffffff", outlineColor: "#000000", position: "top" },
];

export function getSubtitlePreset(id) {
  return SUBTITLE_PRESETS.find((item) => item.id === id) || SUBTITLE_PRESETS[0];
}

export function buildAssForceStyle(style = {}) {
  const alignment = style.position === "top" ? 8 : 2;
  return [
    "FontName=Malgun Gothic",
    `FontSize=${Number(style.fontSize || 42)}`,
    "PrimaryColour=&H00FFFFFF",
    "OutlineColour=&H00000000",
    "BorderStyle=1",
    `Outline=${Number(style.outline || 3)}`,
    `Shadow=${Number(style.shadow || 1)}`,
    `Alignment=${alignment}`,
    `MarginV=${Number(style.marginV || 120)}`,
  ].join(",");
}
```

- [ ] **Step 2: Add preview UI**

Add to `electron/renderer/index.html`:

```html
<section class="panel subtitle-designer">
  <div class="panel-header">
    <h3>Subtitle Preview</h3>
    <span>Live</span>
  </div>
  <div class="subtitle-preview-frame">
    <div id="subtitlePreviewText">오늘의 핵심 뉴스가 30초 안에 정리됩니다</div>
  </div>
  <div class="form-grid">
    <label>크기 <input id="subtitleFontSize" type="range" min="28" max="72" value="54"></label>
    <label>테두리 <input id="subtitleOutline" type="range" min="0" max="8" value="5"></label>
    <label>그림자 <input id="subtitleShadow" type="range" min="0" max="5" value="2"></label>
    <label>하단 여백 <input id="subtitleMarginV" type="range" min="60" max="220" value="150"></label>
  </div>
</section>
```

In `electron/renderer/app.js`:

```js
function updateSubtitlePreview() {
  const preview = document.querySelector("#subtitlePreviewText");
  preview.style.fontSize = `${document.querySelector("#subtitleFontSize").value}px`;
  preview.style.webkitTextStroke = `${document.querySelector("#subtitleOutline").value}px black`;
  preview.style.textShadow = `0 2px ${document.querySelector("#subtitleShadow").value}px black`;
  preview.style.bottom = `${document.querySelector("#subtitleMarginV").value / 4}px`;
}
["subtitleFontSize", "subtitleOutline", "subtitleShadow", "subtitleMarginV"].forEach((id) => {
  document.querySelector(`#${id}`)?.addEventListener("input", updateSubtitlePreview);
});
```

- [ ] **Step 3: Feed style into render**

In `scripts/render-youtube-with-tts.mjs`, read `render-options.json`:

```js
const renderOptionsPath = join(JOB_DIR, "render-options.json");
const renderOptions = existsSync(renderOptionsPath) ? JSON.parse(readFileSync(renderOptionsPath, "utf8")) : {};
const subtitleStyle = renderOptions.subtitleStyle || {};
```

Build filter from the style instead of fixed values:

```js
const subtitleFilter = `subtitles='${escapeFilterPath(srtPath)}':force_style='${renderOptions.assForceStyle || "FontName=Malgun Gothic,FontSize=42,Outline=3,Shadow=1,Alignment=2,MarginV=120"}'`;
```

- [ ] **Step 4: Add static checks and commit**

Append:

```js
const subtitlePresets = readFileSync(resolve(root, "electron/services/subtitle-presets.mjs"), "utf8");
assert.match(subtitlePresets, /buildAssForceStyle/, "subtitle service should build ffmpeg ASS style");
assert.match(html, /subtitlePreviewText/, "renderer should include subtitle preview text");
assert.match(renderer, /updateSubtitlePreview/, "renderer should update subtitle preview live");
```

Run:

```powershell
node .\scripts\check-local-studio-product.mjs
npm.cmd run check
git add electron/services/subtitle-presets.mjs electron/services/subtitle-preview.mjs scripts/render-youtube-with-tts.mjs electron/renderer scripts/check-local-studio-product.mjs
git commit -m "feat: add subtitle style designer"
```

---

## Task 6: Replace Test Scene Generator With Real Workflow Service

**Files:**
- Create: `electron/services/youtube-job-service.mjs`
- Modify: `electron/main.mjs`
- Modify: `youtube-workflow.mjs`
- Modify: `telegram-flow-news-bot.mjs`
- Test: `scripts/check-local-studio-product.mjs`

- [ ] **Step 1: Add static guard against synthetic-only product path**

Append:

```js
const jobService = readFileSync(resolve(root, "electron/services/youtube-job-service.mjs"), "utf8");
assert.match(jobService, /runYouTubeJob/, "desktop job service should use shared runner");
assert.match(jobService, /generateFlowMedia|flow/i, "desktop job service should call Flow stage");
assert.doesNotMatch(main, /createSyntheticSceneVideo/, "main should not contain synthetic scene generator in product path");
```

- [ ] **Step 2: Create job service**

Create `electron/services/youtube-job-service.mjs`:

```js
import { runYouTubeJob } from "../../youtube-job-runner.mjs";
import { generateYouTubeWorkflowAssets, renderFinalYouTubeVideo } from "../../youtube-workflow.mjs";

export async function createYouTubeJob(input, context) {
  return runYouTubeJob(input, {
    ...context,
    generateYouTubeWorkflowAssets,
    renderFinalYouTubeVideo,
  });
}
```

- [ ] **Step 3: Slim main**

Remove from `electron/main.mjs`:
- `createSyntheticSceneVideo`
- inline `createDesktopPreviewJob`
- direct synthetic draft

Replace IPC handler with:

```js
ipcMain.handle("youtube:createJob", async (_event, input) => {
  sendJobEvent({ type: "desktop-job-submitted", input });
  const result = await createYouTubeJob(input, {
    paths,
    emit: sendJobEvent,
    outputDir: OUTPUT_DIR,
  });
  sendJobEvent({ type: "desktop-job-finished", jobId: result.job.id, jobDir: result.assets.jobDir });
  return result;
});
```

- [ ] **Step 4: Run checks and commit**

```powershell
node .\scripts\check-local-studio-product.mjs
npm.cmd run check
git add electron/services/youtube-job-service.mjs electron/main.mjs youtube-workflow.mjs telegram-flow-news-bot.mjs scripts/check-local-studio-product.mjs
git commit -m "feat: connect desktop app to real youtube workflow"
```

---

## Task 7: Job History, Review, And Local Output Management

**Files:**
- Create: `electron/services/job-store.mjs`
- Modify: `electron/main.mjs`
- Modify: `electron/preload.mjs`
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Test: `scripts/check-local-studio-product.mjs`

- [ ] **Step 1: Add job store**

Create `electron/services/job-store.mjs`:

```js
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function appendJob(jobsDir, job) {
  await mkdir(jobsDir, { recursive: true });
  const path = join(jobsDir, `${job.id}.json`);
  await writeFile(path, JSON.stringify(job, null, 2), "utf8");
  return job;
}

export async function readJob(jobsDir, jobId) {
  return JSON.parse(await readFile(join(jobsDir, `${jobId}.json`), "utf8"));
}
```

- [ ] **Step 2: Add Jobs UI**

Add a jobs panel with:

```html
<section class="panel jobs-panel">
  <div class="panel-header">
    <h3>Jobs</h3>
    <button id="refreshJobsBtn" type="button">Refresh</button>
  </div>
  <div id="jobsList"></div>
</section>
```

Renderer function:

```js
async function renderJobs() {
  const jobs = await window.hermes.jobsList();
  document.querySelector("#jobsList").replaceChildren(...jobs.map((job) => {
    const item = document.createElement("button");
    item.type = "button";
    item.textContent = `${job.status} · ${job.title || job.id}`;
    item.addEventListener("click", () => window.hermes.openPath(job.jobDir));
    return item;
  }));
}
```

- [ ] **Step 3: Add checks and commit**

Run:

```powershell
node .\scripts\check-local-studio-product.mjs
npm.cmd run check
git add electron/services/job-store.mjs electron
git commit -m "feat: add local job history and output review"
```

---

## Task 8: ChatGPT Thumbnail Generation With Authenticated Session

**Files:**
- Create: `automation/chatgpt-thumbnail-source.mjs`
- Create: `pipeline/youtube-thumbnail-prompt.mjs`
- Create: `pipeline/youtube-thumbnail.mjs`
- Modify: `electron/services/youtube-job-service.mjs`
- Test: `scripts/check-local-studio-product.mjs`

- [ ] **Step 1: Add thumbnail prompt builder**

Create `pipeline/youtube-thumbnail-prompt.mjs`:

```js
export function buildThumbnailPrompt({ title, script, hookStyle = "smart-curiosity" }) {
  return [
    "Create a high-impact YouTube thumbnail image.",
    "Use Korean headline text directly in the image.",
    `Headline: ${title}`,
    `Context: ${String(script || "").slice(0, 1200)}`,
    `Hook style: ${hookStyle}`,
    "Readable Korean typography, strong contrast, no brand logos, no watermark.",
  ].join("\n");
}
```

- [ ] **Step 2: Add ChatGPT automation contract**

Create `automation/chatgpt-thumbnail-source.mjs`:

```js
export async function generateChatGptThumbnail({ prompt, profileDir, outputDir }) {
  return {
    ok: false,
    prompt,
    profileDir,
    outputDir,
    message: "ChatGPT browser automation body is implemented after auth profile verification.",
  };
}
```

- [ ] **Step 3: Add thumbnail pipeline**

Create `pipeline/youtube-thumbnail.mjs`:

```js
import { buildThumbnailPrompt } from "./youtube-thumbnail-prompt.mjs";
import { generateChatGptThumbnail } from "../automation/chatgpt-thumbnail-source.mjs";

export async function createThumbnailForJob({ draft, paths, jobDir }) {
  const prompt = buildThumbnailPrompt({ title: draft.title, script: draft.script });
  return generateChatGptThumbnail({
    prompt,
    profileDir: paths.chatgptProfileDir,
    outputDir: jobDir,
  });
}
```

- [ ] **Step 4: Commit contract**

Run:

```powershell
node .\scripts\check-local-studio-product.mjs
npm.cmd run check
git add automation/chatgpt-thumbnail-source.mjs pipeline/youtube-thumbnail*.mjs electron/services/youtube-job-service.mjs
git commit -m "feat: add authenticated thumbnail pipeline contract"
```

---

## Task 9: YouTube Upload OAuth And Approval

**Files:**
- Create: `pipeline/youtube-auth.mjs`
- Create: `pipeline/youtube-upload.mjs`
- Modify: `electron/services/auth-service.mjs`
- Modify: `electron/main.mjs`
- Modify: `electron/preload.mjs`
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Test: `scripts/check-local-studio-product.mjs`

- [ ] **Step 1: Add YouTube auth module**

Create `pipeline/youtube-auth.mjs`:

```js
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

export async function loadYouTubeToken(tokenPath) {
  if (!existsSync(tokenPath)) return null;
  return JSON.parse(await readFile(tokenPath, "utf8"));
}

export async function saveYouTubeToken(tokenPath, token) {
  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, JSON.stringify(token, null, 2), "utf8");
  return token;
}
```

- [ ] **Step 2: Add upload service contract**

Create `pipeline/youtube-upload.mjs`:

```js
export async function uploadVideoToYouTube({ videoPath, thumbnailPath, metadata, tokenPath }) {
  if (!videoPath) throw new Error("videoPath is required");
  if (!tokenPath) throw new Error("tokenPath is required");
  return {
    ok: false,
    videoPath,
    thumbnailPath,
    metadata,
    message: "YouTube upload execution is enabled after OAuth client_secrets.json is configured.",
  };
}
```

- [ ] **Step 3: Add UI approval controls**

Add:

```html
<button id="approveUploadBtn" type="button">Approve Upload</button>
```

Renderer:

```js
document.querySelector("#approveUploadBtn")?.addEventListener("click", async () => {
  const result = await window.hermes.youtubeApproveUpload();
  appendLog("Upload approval", result);
});
```

- [ ] **Step 4: Commit**

```powershell
node .\scripts\check-local-studio-product.mjs
npm.cmd run check
git add pipeline/youtube-auth.mjs pipeline/youtube-upload.mjs electron
git commit -m "feat: add youtube upload approval foundation"
```

---

## Task 10: Packaged App Acceptance Before Installer

**Files:**
- Modify: `package.json`
- Create: `scripts/check-packaged-local-studio.mjs`
- Generated: `dist-electron/Hermes YouTube Studio Setup 1.0.0.exe`

- [ ] **Step 1: Add packaged acceptance script**

Create `scripts/check-packaged-local-studio.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const setup = resolve(root, "dist-electron", "Hermes YouTube Studio Setup 1.0.0.exe");
const unpacked = resolve(root, "dist-electron", "win-unpacked", "Hermes YouTube Studio.exe");

assert.ok(existsSync(setup), "setup exe should exist");
assert.ok(existsSync(unpacked), "unpacked exe should exist");
assert.ok(statSync(setup).size > 100_000_000, "setup exe should include Electron runtime");
assert.ok(statSync(unpacked).size > 100_000_000, "unpacked exe should be real executable");

console.log(JSON.stringify({ ok: true, checked: "packaged-local-studio", setup, unpacked }));
```

- [ ] **Step 2: Build installer**

Run:

```powershell
npm.cmd run electron:pack
```

Expected:
- `dist-electron\Hermes YouTube Studio Setup 1.0.0.exe`
- `dist-electron\win-unpacked\Hermes YouTube Studio.exe`

- [ ] **Step 3: Run packaged acceptance**

Run:

```powershell
node .\scripts\check-packaged-local-studio.mjs
```

Expected: PASS.

- [ ] **Step 4: Manual final acceptance**

Run:

```powershell
Start-Process "C:\Users\amd\hermes\dist-electron\win-unpacked\Hermes YouTube Studio.exe"
```

In the app:
- Open Settings/Auth.
- Verify output path is under `%APPDATA%/hermes`.
- Click auth buttons and verify persistent browser windows open.
- Generate a short test video.
- Verify final video exists under `%APPDATA%/hermes/outputs`.

- [ ] **Step 5: Commit**

```powershell
git add package.json scripts/check-packaged-local-studio.mjs
git commit -m "chore: add packaged local studio acceptance check"
```

---

## Self-Review

## Review Incorporation From `2026-05-24-local-studio-plan-review-and-improvements.md`

The review document was checked against the current codebase and this plan. The following items are accepted as technically valid and must be treated as amendments to the implementation tasks above.

### Accepted Amendment 1: Remove User-Specific Hardcoded Runtime Defaults

Applies to Task 1 and Task 10.

The review is correct that `C:/Users/amd/...` paths must not be product defaults for a distributable app. `path-resolver.mjs` must import `node:os` and expose a user-relative default TTS candidate instead of embedding the developer machine path as the only default.

Replace the `path-resolver.mjs` snippet in Task 1 with this version:

```js
import { app } from "electron";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import os from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getRuntimePaths() {
  const appRoot = resolve(__dirname, "..", "..");
  const userData = app.getPath("userData");
  const runtimeRoot = app.isPackaged ? userData : appRoot;
  const resourcesRoot = app.isPackaged ? process.resourcesPath : appRoot;
  const unpackedRoot = app.isPackaged ? join(process.resourcesPath, "app.asar.unpacked") : appRoot;
  const defaultTtsRoot = join(os.homedir(), "supertonic3-local-tts");

  return {
    appRoot,
    userData,
    runtimeRoot,
    resourcesRoot,
    unpackedRoot,
    defaultTtsRoot,
    outputDir: join(runtimeRoot, "outputs"),
    configPath: join(userData, "config.json"),
    jobsDir: join(userData, "jobs"),
    chatgptProfileDir: join(userData, "browser-profiles", "chatgpt-profile"),
    flowProfileDir: join(userData, "browser-profiles", "flow-profile"),
    geminiProfileDir: join(userData, "browser-profiles", "gemini-profile"),
    renderScriptPath: join(unpackedRoot, "scripts", "render-youtube-with-tts.mjs"),
  };
}
```

Update `DEFAULT_CONFIG` in Task 1 so `ttsRoot` is empty until the setup wizard confirms it:

```js
export const DEFAULT_CONFIG = {
  version: 1,
  ttsRoot: "",
  chromePath: "",
  auth: {
    chatgpt: { status: "unknown" },
    gemini: { status: "unknown" },
    googleFlow: { status: "unknown" },
    youtube: { status: "unknown" },
  },
  defaults: {
    scriptLengthMode: "preset",
    scriptLengthPreset: "standard",
    customDurationSeconds: 90,
    voiceId: "male_30_announcer",
    subtitleStyleId: "bold_shorts",
    mockMediaMode: true,
  },
};
```

Add this check to `scripts/check-local-studio-product.mjs`:

```js
assert.match(pathResolver, /defaultTtsRoot/, "path resolver should expose a user-relative default TTS candidate");
assert.doesNotMatch(configStore, /C:\/Users\/amd\/supertonic3-local-tts-20260517-r4/, "config defaults must not hardcode the developer TTS path");
```

### Accepted Amendment 2: Chrome Discovery And Profile Lock Handling

Applies to Task 2.

The review is correct that hardcoding Chrome to `C:/Program Files/Google/Chrome/Application/chrome.exe` is fragile. Add a browser profile service that searches common Chrome paths and tracks per-profile lock files before launching an auth browser.

Create `electron/services/browser-profile-service.mjs`:

```js
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export function findChromeExecutable(env = process.env) {
  const candidates = [
    env.HERMES_CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe") : "",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

export async function claimBrowserProfile(profileDir) {
  await mkdir(profileDir, { recursive: true });
  const lockPath = join(profileDir, "hermes-profile.lock.json");
  if (existsSync(lockPath)) {
    const lock = JSON.parse(await readFile(lockPath, "utf8").catch(() => "{}"));
    if (lock.pid && isProcessRunning(lock.pid)) {
      throw new Error(`Browser profile is already in use by process ${lock.pid}: ${profileDir}`);
    }
  }
  await writeFile(lockPath, JSON.stringify({ pid: process.pid, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  return lockPath;
}

export async function releaseBrowserProfile(lockPath) {
  if (lockPath) await rm(lockPath, { force: true });
}

function isProcessRunning(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}
```

Modify `auth-service.mjs` from Task 2 to use `findChromeExecutable()` instead of a hardcoded Chrome path:

```js
import { claimBrowserProfile, findChromeExecutable } from "./browser-profile-service.mjs";

const chromePath = config.chromePath || findChromeExecutable();
if (!chromePath) throw new Error("Chrome executable was not found. Set Chrome path in Settings.");
await claimBrowserProfile(profileDir);
```

Add static checks:

```js
const browserProfileService = readFileSync(resolve(root, "electron/services/browser-profile-service.mjs"), "utf8");
assert.match(browserProfileService, /findChromeExecutable/, "browser profile service should discover Chrome paths");
assert.match(browserProfileService, /claimBrowserProfile/, "browser profile service should guard profile locks");
assert.doesNotMatch(authService, /C:\/Program Files\/Google\/Chrome\/Application\/chrome\.exe"\s*\}/, "auth service should not rely only on one Chrome path");
```

### Accepted Amendment 3: Dynamic Scene Durations Must Be Weighted By Text Length

Applies to Task 3.

The review is correct that equal `duration_seconds` per scene causes audio/video sync risk when narration length varies. Replace the `planScenesFromScript()` implementation in Task 3 with syllable-weighted duration allocation:

```js
export function planScenesFromScript({ script, title, targetSeconds, customDurationSeconds, characterProfile }) {
  const totalDuration = Number(customDurationSeconds || targetSeconds || 60);
  const sentences = splitKoreanSentences(script);
  const count = targetSceneCount({ sentenceCount: sentences.length, targetSeconds: totalDuration });
  const perScene = Math.max(1, Math.ceil(sentences.length / count));
  const tempScenes = [];
  let totalSyllables = 0;

  for (let index = 0; index < count; index += 1) {
    const narration = sentences.slice(index * perScene, (index + 1) * perScene).join(" ") || script;
    const syllables = narration.replace(/\s+/g, "").length;
    totalSyllables += syllables;
    tempScenes.push({ order: index + 1, narration, syllables });
  }

  let allocatedSeconds = 0;
  const scenes = tempScenes.map((scene) => {
    let duration = Math.round((scene.syllables / Math.max(1, totalSyllables)) * totalDuration);
    duration = Math.max(4, duration);
    allocatedSeconds += duration;
    return {
      order: scene.order,
      narration: scene.narration,
      duration_seconds: duration,
      image_prompt: [
        "9:16 cinematic YouTube shorts scene.",
        `Title: ${title}.`,
        `Narration context: ${scene.narration}.`,
        characterProfile ? `Consistent character: ${characterProfile}.` : "",
        "No subtitles, no readable text, no logos, no watermarks.",
      ].filter(Boolean).join(" "),
    };
  });

  const diff = totalDuration - allocatedSeconds;
  if (diff !== 0 && scenes.length > 0) {
    const last = scenes[scenes.length - 1];
    last.duration_seconds = Math.max(4, last.duration_seconds + diff);
  }

  return scenes;
}
```

Also improve sentence splitting to avoid depending only on punctuation followed by whitespace:

```js
export function splitKoreanSentences(script = "") {
  const normalized = String(script).replace(/\s+/g, " ").trim();
  const matches = normalized.match(/[^.!?。！？]+[.!?。！？]?/gu) || [];
  return matches.map((item) => item.trim()).filter(Boolean);
}
```

Add checks:

```js
assert.match(planner, /totalSyllables/, "scene planner should weight duration by narration length");
assert.match(planner, /Math\.max\(4/, "scene planner should enforce a minimum scene duration");
```

### Accepted Amendment 4: Voice Pitch Must Be Treated As Capability-Dependent

Applies to Task 4.

The review is correct that defining `pitch` in voice presets is not enough. However, the current `Supertonic3Engine.synthesize_to_file()` capability must be verified before blindly passing `pitch`. Update Task 4 with this safer rule:

```python
import inspect

kwargs = {
    "text": text,
    "output_path": out_wav,
    "voice": voice,
    "lang": "ko",
    "speed": speed,
    "total_step": 8,
    "max_chunk_length": 130,
    "silence_duration": 0.25,
    "verbose": False,
}
signature = inspect.signature(engine.synthesize_to_file)
if "pitch" in signature.parameters and "pitch" in render_options:
    kwargs["pitch"] = float(render_options["pitch"])
info = engine.synthesize_to_file(**kwargs)
```

Add checks:

```js
const ttsScript = readFileSync(resolve(root, "scripts/make-scenes-tts.py"), "utf8");
assert.match(ttsScript, /inspect\.signature/, "TTS script should detect optional pitch support before passing pitch");
```

### Accepted Amendment 5: Subtitle Preview Must Match Render More Closely

Applies to Task 5.

The review is correct that CSS `-webkit-text-stroke` does not visually match ASS outline perfectly. Use multi-direction `text-shadow` for the live preview and keep ASS style generation as the render source of truth.

Replace the preview CSS in Task 5 with:

```css
#subtitlePreviewText {
  position: absolute;
  left: 40px;
  right: 40px;
  bottom: 36px;
  color: #fff;
  font-weight: 900;
  text-align: center;
  line-height: 1.12;
  text-shadow:
    -2px -2px 0 #000,  2px -2px 0 #000,
    -2px  2px 0 #000,  2px  2px 0 #000,
     0px -2px 0 #000,  0px  2px 0 #000,
    -2px  0px 0 #000,  2px  0px 0 #000;
}
```

Add a font packaging requirement to Task 5:

```json
"extraResources": [
  {
    "from": "assets/fonts",
    "to": "fonts",
    "filter": ["**/*.ttf", "**/*.otf"]
  }
]
```

Add check:

```js
assert.match(styles, /text-shadow:\s*[\s\S]*-2px -2px 0 #000/, "subtitle preview should use multi-direction outline shadow");
assert.match(JSON.stringify(packageJson.build), /assets\/fonts/, "packaged app should include subtitle fonts");
```

### Accepted Amendment 6: Keep Mock Media Mode, But Make It Explicit

Applies to Task 6.

The review is correct that removing mock rendering entirely would slow down UI and subtitle development. The product path must use real Flow by default, but a clearly labeled `Mock Media Mode` toggle should remain for development and diagnostics.

Change Task 6 static guard from “no synthetic generator anywhere” to “no synthetic generator in default product path”:

```js
assert.match(jobService, /mockMediaMode/, "desktop job service should support explicit mock media mode");
assert.match(jobService, /generateFlowMedia|flow/i, "desktop job service should call Flow stage by default");
assert.match(renderer, /mockMediaMode/, "renderer should expose explicit Mock Media Mode for development");
```

The UI label must be:

```html
<label class="switch">
  <input id="mockMediaMode" type="checkbox">
  <span></span>
  Mock Media Mode
</label>
```

Default must be `false` for packaged builds:

```js
const mockMediaMode = !window.hermes.isPackaged && document.querySelector("#mockMediaMode").checked;
```

### Accepted Amendment 7: Job History Needs An Index

Applies to Task 7.

The review is correct that scanning many full job JSON files can freeze the UI. Replace the simple `appendJob()` design with an index plus lazy detail loading.

Use this job-store shape:

```js
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const INDEX_FILE = "jobs-index.json";

export async function listJobs(jobsDir) {
  const indexPath = join(jobsDir, INDEX_FILE);
  if (!existsSync(indexPath)) return [];
  return JSON.parse(await readFile(indexPath, "utf8"));
}

export async function upsertJob(jobsDir, job) {
  await mkdir(jobsDir, { recursive: true });
  const indexPath = join(jobsDir, INDEX_FILE);
  const current = await listJobs(jobsDir);
  const summary = {
    id: job.id,
    title: job.title || job.sourceValue || job.id,
    status: job.status || "unknown",
    jobDir: job.jobDir,
    updatedAt: new Date().toISOString(),
  };
  const next = [summary, ...current.filter((item) => item.id !== job.id)].slice(0, 500);
  await writeFile(indexPath, JSON.stringify(next, null, 2), "utf8");
  await writeFile(join(jobsDir, `${job.id}.json`), JSON.stringify(job, null, 2), "utf8");
  return summary;
}

export async function readJob(jobsDir, jobId) {
  return JSON.parse(await readFile(join(jobsDir, `${jobId}.json`), "utf8"));
}
```

Add check:

```js
const jobStore = readFileSync(resolve(root, "electron/services/job-store.mjs"), "utf8");
assert.match(jobStore, /jobs-index\.json/, "job store should maintain an index file");
assert.match(jobStore, /listJobs/, "job store should list summaries without loading every job body");
```

### Accepted Amendment 8: Thumbnail Strategy Should Be Robust, But ChatGPT Remains Primary

Applies to Task 8.

The review is right that ChatGPT browser automation can break due to UI or anti-abuse changes. However, replacing ChatGPT with Google Flow image mode as the primary thumbnail generator conflicts with the product requirement because Google Flow Korean text rendering is unreliable. Therefore:

- Primary: authenticated ChatGPT image generation with Korean headline text.
- Secondary: if ChatGPT image generation fails, extract or generate a clean background image and compose Korean headline locally with `sharp`.
- Do not use Google Flow to render Korean text inside thumbnail images.

Update `pipeline/youtube-thumbnail.mjs` contract:

```js
export async function createThumbnailForJob({ draft, paths, jobDir }) {
  const prompt = buildThumbnailPrompt({ title: draft.title, script: draft.script });
  const chatgpt = await generateChatGptThumbnail({
    prompt,
    profileDir: paths.chatgptProfileDir,
    outputDir: jobDir,
  }).catch((error) => ({ ok: false, error: error.message }));
  if (chatgpt.ok) return chatgpt;
  return createLocalCompositedThumbnail({
    title: draft.title,
    script: draft.script,
    jobDir,
    reason: chatgpt.error || "ChatGPT thumbnail generation failed",
  });
}
```

Add static checks:

```js
const thumbnail = readFileSync(resolve(root, "pipeline/youtube-thumbnail.mjs"), "utf8");
assert.match(thumbnail, /generateChatGptThumbnail/, "thumbnail pipeline should keep ChatGPT as primary");
assert.match(thumbnail, /createLocalCompositedThumbnail/, "thumbnail pipeline should provide local sharp fallback");
assert.doesNotMatch(thumbnail, /Flow.*Korean text/i, "thumbnail pipeline should not rely on Flow for Korean text rendering");
```

### Accepted Amendment 9: YouTube OAuth Needs `googleapis` And Loopback Receiver

Applies to Task 9.

The review is correct that the plan must explicitly add `googleapis` and a temporary loopback HTTP receiver for OAuth redirects.

Update Task 9 with:

```powershell
npm.cmd install googleapis
```

Update `pipeline/youtube-auth.mjs` with a loopback receiver contract:

```js
import http from "node:http";

export function waitForOAuthCode({ port = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${server.address().port}`);
        const code = url.searchParams.get("code");
        if (!code) throw new Error("OAuth code missing");
        res.end("Hermes YouTube authentication complete. You can close this window.");
        server.close();
        resolve({ code, redirectUri: `http://127.0.0.1:${server.address().port}` });
      } catch (error) {
        res.statusCode = 400;
        res.end(error.message);
        reject(error);
      }
    });
    server.listen(port, "127.0.0.1");
  });
}
```

Add checks:

```js
assert.ok(packageJson.dependencies.googleapis, "googleapis should be a runtime dependency for YouTube upload");
const youtubeAuth = readFileSync(resolve(root, "pipeline/youtube-auth.mjs"), "utf8");
assert.match(youtubeAuth, /waitForOAuthCode/, "YouTube auth should include loopback OAuth code receiver");
assert.match(youtubeAuth, /127\.0\.0\.1/, "OAuth receiver should bind to localhost");
```

### Accepted Amendment 10: Installer Must Validate External TTS Instead Of Pretending It Is Bundled

Applies to Task 10.

The review is correct that the Supertonic runtime and model files are too large and environment-specific to assume they are bundled. The local product must include a setup wizard step that validates:

- TTS root exists.
- `.venv-win/Scripts/python.exe` exists under the selected Supertonic directory.
- `src/supertonic3_engine.py` exists.
- A 1-sentence sample synthesis succeeds before enabling production generation.

Add this setup validation contract:

```js
export function validateTtsPath(ttsRoot) {
  const pythonPath = join(ttsRoot, "supertonic3-local-tts", ".venv-win", "Scripts", "python.exe");
  const enginePath = join(ttsRoot, "supertonic3-local-tts", "src", "supertonic3_engine.py");
  return {
    ok: existsSync(pythonPath) && existsSync(enginePath),
    pythonPath,
    enginePath,
  };
}
```

Add check:

```js
const healthCheck = readFileSync(resolve(root, "electron/services/health-check.mjs"), "utf8");
assert.match(healthCheck, /validateTtsPath/, "health check should validate external Supertonic TTS path");
assert.match(healthCheck, /supertonic3_engine\.py/, "health check should verify Supertonic engine source");
```

### Rejected Or Modified Review Items

- Rejected as primary strategy: using Google Flow image mode as the main thumbnail generator. Reason: previous product decision says Flow Korean text is unreliable. The accepted version keeps ChatGPT as primary and adds a local `sharp` fallback.
- Modified: removing mock rendering entirely. The accepted version keeps explicit `Mock Media Mode` for development, but requires real Flow as the packaged default.
- Modified: passing `pitch` blindly to Supertonic. The accepted version checks whether the installed engine supports the `pitch` argument before using it.

Spec coverage:
- Button-based ChatGPT/Gemini/Google Flow/YouTube auth: Task 2 and Task 9.
- Persistent auth reuse: Task 1 and Task 2 profile/config storage.
- Manual script length beyond 90 seconds: Task 3 with `customDurationSeconds` up to 600.
- Scene count proportional to script sentence count: Task 3.
- Expanded professional voice catalog: Task 4.
- Subtitle style, size, outline, shadow preview: Task 5.
- Local completed product before installer: Product Principle and Task 10.
- Better product architecture: Tasks 1, 6, 7.
- Installation build only after local verification: Task 10.

Known sequencing decision:
- Task 8 introduces ChatGPT thumbnail automation as a contract first, because it depends on Task 2 persistent authentication profile. Full DOM/click implementation should be executed after Task 2 verifies the ChatGPT profile is stable on this PC.
- Task 9 introduces YouTube upload foundation and approval first, because real upload requires user-provided Google OAuth client credentials.

Verification gate:
- No new installer should be treated as final unless these pass:

```powershell
npm.cmd run check
node .\scripts\check-local-studio-product.mjs
npm.cmd run electron:pack
node .\scripts\check-packaged-local-studio.mjs
```

Plan complete and saved to `docs/superpowers/plans/2026-05-24-local-studio-complete-product-plan.md`.
