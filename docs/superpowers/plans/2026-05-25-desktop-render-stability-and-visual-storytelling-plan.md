# Desktop Render Stability and Visual Storytelling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Electron YouTube Studio must finish final rendering reliably in packaged builds, and Google Flow scene prompts must create context-rich, visually engaging B-roll instead of simply showing a presenter reading the script.

**Architecture:** Fix rendering by making the packaged Electron app run the final render in a guaranteed Node-compatible mode through a non-blocking child process, then add automated checks that reject Chromium/Electron cache errors during render. Improve visual storytelling by introducing a scene visual planner that converts each narration beat into action-oriented cinematic prompts with topic objects, demonstrations, environments, and consistent character rules only when a character is truly needed.

**Tech Stack:** Electron, Node.js ESM, Playwright, Google Gemini browser automation, Google Flow browser automation, FFmpeg, Supertonic local TTS, existing Hermes workflow modules.

---

## Problem Summary

The user-facing failure appears at `Progress 82%` during `TTS/자막/최종 렌더`:

```text
YouTube final render failed
STDERR:
[...ERROR:net\disk_cache\cache_util_win.cc:25] Unable to move the cache: 액세스가 거부되었습니다. (0x5)
[...ERROR:gpu\ipc\host\gpu_disk_cache.cc:737] Gpu Cache Creation failed: -2
```

This is not a TTS, subtitle, or FFmpeg media error. It is a Chromium/Electron cache error. The most likely root cause is that the final render script is being launched by an Electron executable in normal Chromium mode instead of a pure Node runtime. In packaged Electron builds, `process.execPath` points to the Electron executable, so a child process can accidentally start Chromium and fight with the app cache directory.

The current source already contains a partial fallback in `youtube-workflow.mjs`, but the packaged app must be made deterministic. It should never rely on a system `node` command being present, and it should never start Chromium just to run `scripts/render-youtube-with-tts.mjs`.

## Review Reconciliation

The follow-up review document `C:/Users/amd/hermes/HERMES_RENDER_STABILITY_AND_VISUAL_STORYTELLING_REVIEW.md` was checked against the current codebase. The following items are technically valid and are incorporated into this plan:

- `spawnSync` is not enough for Electron UX: even with `ELECTRON_RUN_AS_NODE=1`, a synchronous final render blocks the Electron main process. The plan now requires asynchronous `spawn`.
- Test scripts should not hardcode `C:/Users/amd/hermes`: the new render-runner check now resolves the repo root from `import.meta.url`.
- Local visual prompt fallback should not cycle the same 4 environment templates forever: the plan now adds narration keyword extraction and per-scene variations.
- Render failures should be stored in SQLite: `bot_db_helper.py log-failure` and `task_failures` already exist, so the plan now extends `workflow-db-events.mjs` to mirror failure events for `/diagnose`.

No review item was rejected.

## File Map

- Modify: `C:/Users/amd/hermes/youtube-workflow.mjs`
  - Owns `renderFinalYouTubeVideo`.
  - Must select a render script runner that works in both development and packaged Electron.
  - Must run the final render with asynchronous `spawn`, not `spawnSync`, so the Electron main process event loop remains responsive.

- Modify: `C:/Users/amd/hermes/electron/services/youtube-job-service.mjs`
  - Passes runtime paths into the shared workflow.
  - Should pass a `nodeBin` or `renderRunner` explicitly so packaged behavior is not guessed.

- Create: `C:/Users/amd/hermes/scripts/check-packaged-render-runner.mjs`
  - Static contract test that ensures render execution uses `ELECTRON_RUN_AS_NODE=1` or a verified Node runtime, not raw Chromium/Electron mode.

- Modify: `C:/Users/amd/hermes/package.json`
  - Add `check:packaged-render-runner` to `npm run check`.

- Modify: `C:/Users/amd/hermes/workflow-db-events.mjs`
  - Currently mirrors workflow events into SQLite with `log-event`.
  - Should also mirror render and workflow failures into `task_failures` through `bot_db_helper.py log-failure`.

- Modify: `C:/Users/amd/hermes/electron/services/script-planner.mjs`
  - Replace generic “9:16 cinematic scene + narration context” prompts with visual-storytelling prompts.
  - Avoid simple modulo repetition for long videos by mixing in narration keywords and per-scene visual variations.

- Modify: `C:/Users/amd/hermes/automation/gemini-research-draft.mjs`
  - Strengthen Gemini prompt rules so draft scenes include `visual_intent`, `main_subject`, `action`, `setting`, `camera_motion`, and `avoid_presenter_reading`.

- Modify: `C:/Users/amd/hermes/youtube-workflow.mjs`
  - Normalize richer scene fields while keeping backward compatibility with older `image_prompt`.

- Create: `C:/Users/amd/hermes/scripts/check-visual-storytelling-prompts.mjs`
  - Verifies generated prompts include topic-specific visual action, objects, and camera direction, and do not default to “person talking to camera”.

---

## Task 1: Make Final Render Use a Deterministic Node Runner

**Files:**
- Modify: `C:/Users/amd/hermes/youtube-workflow.mjs`
- Modify: `C:/Users/amd/hermes/electron/services/youtube-job-service.mjs`
- Create: `C:/Users/amd/hermes/scripts/check-packaged-render-runner.mjs`
- Modify: `C:/Users/amd/hermes/package.json`

- [ ] **Step 1: Add a render runner resolver test**

Create `C:/Users/amd/hermes/scripts/check-packaged-render-runner.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");
const desktopService = readFileSync(resolve(root, "electron/services/youtube-job-service.mjs"), "utf8");

assert.match(
  workflow,
  /ELECTRON_RUN_AS_NODE/,
  "packaged Electron renders must run scripts with ELECTRON_RUN_AS_NODE=1 instead of starting Chromium"
);
assert.match(
  workflow,
  /resolveRenderNodeRunner/,
  "renderFinalYouTubeVideo should use an explicit runner resolver"
);
assert.match(
  desktopService,
  /nodeBin|renderRunner/,
  "desktop service should pass render runner information explicitly"
);
assert.doesNotMatch(
  workflow,
  /spawnSync\(process\.execPath,\s*\[scriptPath,\s*jobDir\]/,
  "renderFinalYouTubeVideo must not directly spawn process.execPath without Electron node-mode handling"
);
assert.doesNotMatch(
  workflow,
  /spawnSync\(runner\.command,\s*\[scriptPath,\s*jobDir\]/,
  "final render must not use spawnSync because it blocks the Electron main process"
);
assert.match(
  workflow,
  /spawn\(runner\.command,\s*\[scriptPath,\s*jobDir\]/,
  "final render should use asynchronous spawn so the UI event loop remains responsive"
);

console.log(JSON.stringify({ ok: true, checked: "packaged-render-runner" }));
```

- [ ] **Step 2: Run the new test and confirm it fails before implementation**

Run:

```powershell
node scripts/check-packaged-render-runner.mjs
```

Expected before implementation:

```text
AssertionError: packaged Electron renders must run scripts with ELECTRON_RUN_AS_NODE=1
```

If `ELECTRON_RUN_AS_NODE` already exists from a partial implementation, the expected failure may instead be:

```text
AssertionError: final render must not use spawnSync because it blocks the Electron main process
```

- [ ] **Step 3: Implement `resolveRenderNodeRunner`**

In `C:/Users/amd/hermes/youtube-workflow.mjs`, add this helper near `renderFinalYouTubeVideo`:

```js
export function resolveRenderNodeRunner(context = {}) {
  const explicit = context.nodeBin || process.env.HERMES_NODE_BIN || process.env.npm_node_execpath;
  if (explicit && !/electron\.exe$/i.test(explicit)) {
    return {
      command: explicit,
      env: {},
      mode: "node",
    };
  }

  if (/electron(\.exe)?$/i.test(process.execPath)) {
    return {
      command: process.execPath,
      env: { ELECTRON_RUN_AS_NODE: "1" },
      mode: "electron-run-as-node",
    };
  }

  return {
    command: process.execPath,
    env: {},
    mode: "current-node",
  };
}
```

- [ ] **Step 4: Use asynchronous `spawn` in `renderFinalYouTubeVideo`**

At the top of `C:/Users/amd/hermes/youtube-workflow.mjs`, import asynchronous `spawn` alongside existing child process usage:

```js
import { spawn } from "node:child_process";
```

Then replace the render child process creation in `renderFinalYouTubeVideo` with a Promise-wrapped `spawn`. Do not use `spawnSync` for final rendering because it blocks the Electron main process and can make the UI appear frozen at 82%.

```js
const runner = resolveRenderNodeRunner(context);
const timeoutMs = Number(context.timeoutMs || process.env.HERMES_YOUTUBE_RENDER_TIMEOUT_MS || 15 * 60 * 1000);

const { stdout, stderr } = await new Promise((resolveChild, rejectChild) => {
  const child = spawn(runner.command, [scriptPath, jobDir], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...runner.env,
      HERMES_YOUTUBE_FINAL_NAME: finalName,
      HERMES_RENDER_RUNNER_MODE: runner.mode,
      ...(context.env || {}),
    },
    windowsHide: true,
  });

  let stdoutData = "";
  let stderrData = "";
  let settled = false;

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    child.kill("SIGTERM");
    rejectChild(new Error(`YouTube final render timed out after ${timeoutMs}ms.\nSTDERR:\n${stderrData}`));
  }, timeoutMs);

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.stdout.on("data", (chunk) => {
    stdoutData += chunk;
    context.emit?.({
      type: "workflow-progress",
      jobId: job.id,
      phase: "render",
      message: "최종 렌더 로그를 수신하는 중입니다.",
      details: { stream: "stdout", preview: String(chunk).slice(0, 500) },
    });
  });

  child.stderr.on("data", (chunk) => {
    stderrData += chunk;
    context.emit?.({
      type: "workflow-progress",
      jobId: job.id,
      phase: "render",
      message: "최종 렌더 로그를 수신하는 중입니다.",
      details: { stream: "stderr", preview: String(chunk).slice(0, 500) },
    });
  });

  child.on("error", (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    rejectChild(error);
  });

  child.on("close", (code) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (code !== 0) {
      rejectChild(new Error(`YouTube final render failed with exit code ${code}.\nSTDOUT:\n${stdoutData}\nSTDERR:\n${stderrData}`));
      return;
    }
    resolveChild({ stdout: stdoutData, stderr: stderrData });
  });
});
```

- [ ] **Step 5: Surface Chromium cache errors with a clearer message**

Still in `renderFinalYouTubeVideo`, add a helper before the Promise so Chromium cache failures are transformed into a clear render-runner error before they reach the UI:

```js
function buildRenderFailure(error, runner) {
  const message = error?.message || String(error);
  if (/Gpu Cache Creation failed|Unable to move the cache|disk_cache/i.test(message)) {
    return new Error([
      "YouTube final render launched in Chromium/Electron mode instead of Node mode.",
      "This usually means the packaged app is using an old build or the render runner did not set ELECTRON_RUN_AS_NODE=1.",
      `Runner: ${runner.command}`,
      `Runner mode: ${runner.mode}`,
      `Original error:\n${message}`,
    ].join("\n"));
  }
  return error;
}
```

Then wrap the child execution:

```js
let childOutput;
try {
  childOutput = await runRenderChild({ runner, scriptPath, jobDir, finalName, timeoutMs, context, job });
} catch (error) {
  throw buildRenderFailure(error, runner);
}
const renderOutput = childOutput.stdout.trim().match(/\{[\s\S]*\}\s*$/)?.[0] || "{}";
```

The implementation can keep this as an inline Promise or extract `runRenderChild`; the behavior must remain asynchronous.

- [ ] **Step 6: Parse output after asynchronous render**

After `childOutput` is available, keep the existing final path validation:

```js
let parsed = {};
try {
  parsed = JSON.parse(renderOutput);
} catch {
  parsed = {};
}

const finalPath = parsed.finalPath || join(jobDir, finalName);
if (!existsSync(finalPath)) {
  throw new Error([
    `Final rendered video was not found: ${finalPath}`,
    `Runner mode: ${runner.mode}`,
    `STDOUT:\n${childOutput.stdout}`,
    `STDERR:\n${childOutput.stderr}`,
  ].join("\n"));
}

return { ...parsed, finalPath, jobDir };
```

- [ ] **Step 7: Pass runner context from Electron service**

In `C:/Users/amd/hermes/electron/services/youtube-job-service.mjs`, pass an explicit `nodeBin` only when a real Node binary is available. Do not pass `process.execPath` from Electron unless it will be handled by `resolveRenderNodeRunner`.

Implementation:

```js
const nodeBin = process.env.HERMES_NODE_BIN || process.env.npm_node_execpath || "";
```

Then include it in the `runYouTubeJob` context:

```js
nodeBin,
```

- [ ] **Step 8: Add test to package check chain**

Modify `C:/Users/amd/hermes/package.json`:

```json
"check:packaged-render-runner": "node scripts/check-packaged-render-runner.mjs"
```

Add it to `check` after `check:desktop-progress` or near the existing Electron checks.

- [ ] **Step 9: Verify render runner test**

Run:

```powershell
node scripts/check-packaged-render-runner.mjs
```

Expected:

```json
{"ok":true,"checked":"packaged-render-runner"}
```

- [ ] **Step 10: Verify full workflow**

Run:

```powershell
npm.cmd run smoke:youtube-mock
npm.cmd run check
```

Expected:

```text
smoke:youtube-mock exits 0
npm run check exits 0
```

- [ ] **Step 11: Rebuild packaged Electron app**

Run:

```powershell
npm.cmd run electron:pack
```

Expected files:

```text
C:\Users\amd\hermes\dist-electron\win-unpacked\Hermes YouTube Studio.exe
C:\Users\amd\hermes\dist-electron\Hermes YouTube Studio Setup 1.0.0.exe
```

- [ ] **Step 12: Manual packaged verification**

Run the packaged exe:

```powershell
& "C:\Users\amd\hermes\dist-electron\win-unpacked\Hermes YouTube Studio.exe"
```

In the UI:

1. Enter keyword `구글 글래스`.
2. Select `30초`.
3. Keep `Mock Media Mode` off for real Flow test, or on for fast local test.
4. Click `Generate Final Video`.

Expected:

```text
Progress reaches 100%.
Current message: 최종 영상 생성이 완료되었습니다.
Latest output is enabled.
No Chromium disk_cache / GPU cache error appears in Console.
```

- [ ] **Step 13: Commit**

```powershell
git add youtube-workflow.mjs electron/services/youtube-job-service.mjs scripts/check-packaged-render-runner.mjs package.json
git commit -m "fix: run packaged render scripts in node mode"
```

---

## Task 2: Replace Generic Presenter Scenes With Visual Storytelling Prompts

**Files:**
- Modify: `C:/Users/amd/hermes/electron/services/script-planner.mjs`
- Modify: `C:/Users/amd/hermes/automation/gemini-research-draft.mjs`
- Modify: `C:/Users/amd/hermes/youtube-workflow.mjs`
- Create: `C:/Users/amd/hermes/scripts/check-visual-storytelling-prompts.mjs`
- Modify: `C:/Users/amd/hermes/package.json`

- [ ] **Step 1: Add prompt quality test**

Create `C:/Users/amd/hermes/scripts/check-visual-storytelling-prompts.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { planScenesFromScript } from "../electron/services/script-planner.mjs";

const scenes = planScenesFromScript({
  title: "구글 글래스의 귀환",
  script: "구글 글래스가 다시 주목받고 있습니다. 현장 작업자는 눈앞에서 매뉴얼을 보고, 의사는 수술 정보를 확인하고, 여행자는 길 안내를 바로 볼 수 있습니다. 하지만 개인정보와 촬영 알림 문제도 함께 해결해야 합니다.",
  targetSeconds: 45,
  characterProfile: "same Korean tech reporter in her early 30s, black bob haircut, teal blazer",
});

assert.ok(scenes.length >= 3, "script should be split into multiple visual beats");

for (const scene of scenes) {
  assert.match(scene.image_prompt, /Visual goal:/, "prompt should contain a visual goal");
  assert.match(scene.image_prompt, /Action:/, "prompt should contain an action");
  assert.match(scene.image_prompt, /Camera:/, "prompt should contain camera direction");
  assert.match(scene.image_prompt, /Scene keywords:/, "prompt should include narration-derived scene keywords to avoid repeated generic B-roll");
  assert.match(scene.image_prompt, /No talking head|avoid a person simply speaking/i, "prompt should avoid plain presenter reading");
  assert.doesNotMatch(scene.image_prompt, /Narration context:.*No subtitles/s, "prompt should not be the old generic narration-context template");
}

const combined = scenes.map((scene) => scene.image_prompt).join("\n");
assert.match(combined, /smart glasses|augmented reality|AR|heads-up display/i, "prompts should reflect Google Glass / AR keywords");
assert.match(combined, /worksite|doctor|travel|navigation|manual|privacy|camera/i, "prompts should turn script ideas into concrete visual situations");
assert.equal(new Set(scenes.map((scene) => scene.image_prompt)).size, scenes.length, "each scene prompt should be unique even when the environment template cycles");

console.log(JSON.stringify({ ok: true, checked: "visual-storytelling-prompts" }));
```

- [ ] **Step 2: Run test and confirm it fails before prompt planner changes**

Run:

```powershell
node scripts/check-visual-storytelling-prompts.mjs
```

Expected before implementation:

```text
AssertionError: prompt should contain a visual goal
```

- [ ] **Step 3: Add visual prompt builder**

In `C:/Users/amd/hermes/electron/services/script-planner.mjs`, add:

```js
function inferVisualKeywords({ title, narration }) {
  const text = `${title} ${narration}`.toLowerCase();
  if (/구글 글래스|google glass|smart glass|스마트.?글래스|ar|증강/.test(text)) {
    return {
      subject: "sleek smart glasses with a subtle heads-up AR display",
      environments: [
        "a technician repairing equipment while a floating manual overlay guides each step",
        "a doctor reviewing patient vitals on a transparent AR interface in a bright clinic",
        "a traveler walking through a city while navigation arrows appear in their field of view",
        "a close-up of a privacy indicator light turning on before recording starts",
      ],
      motifs: "transparent interface elements, practical hands-free use, realistic reflections on lenses",
    };
  }
  if (/ai|인공지능|챗gpt|chatgpt|gemini/.test(text)) {
    return {
      subject: "AI tools transforming real work on screens and devices",
      environments: [
        "a newsroom desk where article drafts, charts, and model outputs update rapidly",
        "a designer reviewing AI-generated storyboard frames on a large monitor",
        "a small business owner automating repetitive tasks on a laptop dashboard",
      ],
      motifs: "clean data overlays, fast iteration, human using AI as a tool",
    };
  }
  return {
    subject: "the core object or situation from the narration",
    environments: [
      "a concrete real-world demonstration of the narration idea",
      "a close-up of the key object in use",
      "a before-and-after visual contrast that makes the idea easy to understand",
    ],
    motifs: "clear cause and effect, visible action, simple visual metaphor",
  };
}

function extractSceneKeywords(text = "") {
  return Array.from(new Set(String(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => Array.from(item).length >= 2)
    .slice(0, 8)));
}

function sceneVariation({ order, narration }) {
  const keywords = extractSceneKeywords(narration);
  const emphasis = [
    "show cause and effect through visible motion",
    "use a close-up detail shot before revealing the wider situation",
    "contrast the old way and the new way in one continuous shot",
    "show the user interaction from the viewer's point of view",
    "use foreground object movement to lead into the next idea",
    "show a realistic problem being solved on screen without readable text",
  ][(order - 1) % 6];
  return {
    keywords: keywords.join(", "),
    emphasis,
  };
}

function buildVisualStoryPrompt({ title, narration, order, characterProfile }) {
  const visual = inferVisualKeywords({ title, narration });
  const environment = visual.environments[(order - 1) % visual.environments.length];
  const variation = sceneVariation({ order, narration });
  return [
    "9:16 cinematic YouTube shorts B-roll scene.",
    `Visual goal: make this narration instantly understandable without showing subtitles or text: ${narration}`,
    `Main subject: ${visual.subject}.`,
    `Action: ${environment}.`,
    `Scene keywords: ${variation.keywords}.`,
    `Variation: ${variation.emphasis}.`,
    `Context keywords: ${title}; ${visual.motifs}.`,
    "Camera: dynamic close-up to medium shot, smooth handheld or dolly motion, clear subject focus, polished realistic lighting.",
    characterProfile ? `Character consistency: if a recurring human is needed, use ${characterProfile}; otherwise prioritize objects, environments, demonstrations, and visual metaphors over a talking presenter.` : "",
    "No talking head, avoid a person simply speaking to camera, no presenter reading the script.",
    "No subtitles, no readable text, no logos, no watermarks.",
  ].filter(Boolean).join(" ");
}
```

- [ ] **Step 4: Use visual prompt builder in scene planning**

Replace the current `image_prompt` construction inside `planScenesFromScript` with:

```js
image_prompt: buildVisualStoryPrompt({
  title,
  narration: scene.narration,
  order: scene.order,
  characterProfile,
}),
```

- [ ] **Step 5: Update Gemini prompt schema**

In `C:/Users/amd/hermes/automation/gemini-research-draft.mjs`, change schema text from:

```text
{"title":"string","character_profile":"English stable character profile","duration_seconds":90,"script":"Korean narration","scenes":[{"order":1,"narration":"Korean sentence","image_prompt":"English Google Flow 9:16 video prompt","duration_seconds":8}]}
```

To:

```text
{"title":"string","character_profile":"English stable character profile or empty string","duration_seconds":90,"script":"Korean narration","scenes":[{"order":1,"narration":"Korean sentence","visual_intent":"what viewer should understand visually","main_subject":"topic-specific object/person/place","action":"visible action or demonstration","setting":"specific environment","camera_motion":"camera direction","image_prompt":"English Google Flow 9:16 cinematic B-roll prompt","duration_seconds":8}]}
```

- [ ] **Step 6: Add Gemini rules against generic presenter shots**

In `buildGeminiPrompt`, add these rules:

```text
- Do not make every scene a person presenting or reading the narration.
- Prefer concrete B-roll: product close-ups, real-world use cases, demonstrations, environments, UI-like visual metaphors without readable text, and before/after contrasts.
- Each scene must include a different visual action that reflects the sentence meaning.
- If the topic has an object, technology, place, chart, risk, or process, show that visually.
- Use the recurring character only as a guide, observer, or user when helpful; do not force a talking presenter into every scene.
```

- [ ] **Step 7: Preserve richer scene fields during normalization**

In `C:/Users/amd/hermes/youtube-workflow.mjs`, update `normalizeScene` return value:

```js
return {
  order: Number(scene.order || index + 1),
  narration: cleanText(scene.narration || scene.voiceover || scene.text || ""),
  visual_intent: cleanText(scene.visual_intent || scene.visualIntent || ""),
  main_subject: cleanText(scene.main_subject || scene.mainSubject || ""),
  action: cleanText(scene.action || ""),
  setting: cleanText(scene.setting || ""),
  camera_motion: cleanText(scene.camera_motion || scene.cameraMotion || ""),
  image_prompt: withCharacterProfile(imagePrompt, characterProfile),
  duration_seconds: Number(scene.duration_seconds || scene.durationSeconds || 8),
};
```

- [ ] **Step 8: Run prompt quality test**

Run:

```powershell
node scripts/check-visual-storytelling-prompts.mjs
```

Expected:

```json
{"ok":true,"checked":"visual-storytelling-prompts"}
```

- [ ] **Step 9: Add prompt quality test to package checks**

Modify `C:/Users/amd/hermes/package.json`:

```json
"check:visual-storytelling": "node scripts/check-visual-storytelling-prompts.mjs"
```

Add it to `npm run check`.

- [ ] **Step 10: Manual visual QA with Google Flow**

Run the Electron app and generate `구글 글래스` with real Flow.

Inspect:

```text
C:\Users\amd\hermes\outputs\desktop\<latest-job>\draft.json
C:\Users\amd\hermes\outputs\desktop\<latest-job>\metadata.json
C:\Users\amd\hermes\outputs\desktop\<latest-job>\scene_1_flow_submitted.png
C:\Users\amd\hermes\outputs\desktop\<latest-job>\scene_1.mp4
```

Acceptance criteria:

```text
The prompts mention Google Glass / smart glasses / AR / hands-free use.
Scenes show demonstrations, close-ups, environments, or visual metaphors.
Scenes do not all show a presenter talking to camera.
If a human appears, the identity is consistent.
The final render reaches 100%.
Subtitles stay at lower-middle and max 2 lines.
```

- [ ] **Step 11: Commit**

```powershell
git add electron/services/script-planner.mjs automation/gemini-research-draft.mjs youtube-workflow.mjs scripts/check-visual-storytelling-prompts.mjs package.json
git commit -m "feat: improve youtube visual storytelling prompts"
```

---

## Task 3: Improve UI Failure Reporting for Render Runner Errors

**Files:**
- Modify: `C:/Users/amd/hermes/workflow-db-events.mjs`
- Modify: `C:/Users/amd/hermes/electron/services/job-progress-events.mjs`
- Modify: `C:/Users/amd/hermes/electron/renderer/app.js`
- Modify: `C:/Users/amd/hermes/scripts/check-desktop-progress-feedback.mjs`

- [ ] **Step 1: Add expected action-required message contract**

In `C:/Users/amd/hermes/scripts/check-desktop-progress-feedback.mjs`, add assertions that render failures expose a recovery hint:

```js
assert.match(renderer, /ELECTRON_RUN_AS_NODE|렌더 실행기|최신 설치본/, "renderer should show render runner recovery guidance");
assert.match(progress, /actionRequired/, "progress events should support action-required recovery messages");
assert.match(workflowDbEvents, /log-failure/, "workflow DB mirror should persist render failures to task_failures");
```

Load `workflowDbEvents` in the test with:

```js
const workflowDbEvents = readFileSync(new URL("../workflow-db-events.mjs", import.meta.url), "utf8");
```

- [ ] **Step 2: Map render runner errors to user guidance**

In `C:/Users/amd/hermes/electron/services/job-progress-events.mjs`, when an error message contains `Chromium/Electron mode`, `Gpu Cache Creation failed`, or `disk_cache`, return:

```js
{
  phase: "render",
  status: "action-required",
  message: "렌더 실행기가 Electron/Chromium 모드로 실행되어 최종 렌더가 중단되었습니다.",
  actionRequired: {
    title: "최신 설치본 재실행 필요",
    message: "앱을 완전히 종료한 뒤 최신 Hermes YouTube Studio.exe로 다시 실행하세요. 문제가 반복되면 설치본을 다시 생성해야 합니다.",
  },
}
```

- [ ] **Step 3: Keep the console technical detail**

In `C:/Users/amd/hermes/electron/renderer/app.js`, keep the full error in console log, but make the progress panel show the shorter recovery guidance.

- [ ] **Step 4: Persist render failures into SQLite**

In `C:/Users/amd/hermes/workflow-db-events.mjs`, keep the existing `log-event` behavior and add a second `log-failure` call when the event is a failure. The existing code already knows `dbHelper`, `pythonBin`, `taskName`, `chatId`, and `messageId`, so this should be a small extension.

Add this helper:

```js
function isFailureEvent(event = {}) {
  return event.type === "desktop-job-failed"
    || event.status === "failed"
    || /failed|failure|Gpu Cache Creation failed|disk_cache|Unable to move the cache/i.test(String(event.message || ""));
}
```

After the `log-event` `spawnSync`, add:

```js
let failureResult = null;
if (isFailureEvent(event)) {
  const failurePayload = JSON.stringify({
    type: event.type || "",
    phase: event.phase || "",
    status: event.status || "",
    message: event.message || "",
    details: event.details || {},
    renderRunnerMode: event.details?.renderRunnerMode || event.details?.runnerMode || "",
    updatedAt: event.updatedAt || new Date().toISOString(),
  });
  failureResult = spawnSync(pythonBin, [
    dbHelper,
    "log-failure",
    taskName,
    chatId,
    messageId,
    failurePayload,
    "0",
  ], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
}
```

Return `failureResult` for diagnostics:

```js
return {
  ok: result.status === 0 && (!failureResult || failureResult.status === 0),
  status: result.status,
  stdout: result.stdout,
  stderr: result.stderr,
  failureStatus: failureResult?.status ?? null,
  failureStdout: failureResult?.stdout ?? "",
  failureStderr: failureResult?.stderr ?? "",
};
```

This is valid because `bot_db_helper.py` already has `log-failure` and `task_failures`, and Telegram `/diagnose` already reads recent failures.

- [ ] **Step 5: Verify progress feedback and DB failure logging**

Run:

```powershell
npm.cmd run check:desktop-progress
npm.cmd run check
```

Expected:

```text
Desktop progress feedback contract OK
npm run check exits 0
```

- [ ] **Step 6: Commit**

```powershell
git add workflow-db-events.mjs electron/services/job-progress-events.mjs electron/renderer/app.js scripts/check-desktop-progress-feedback.mjs
git commit -m "fix: explain render runner failures in desktop progress"
```

---

## Verification Checklist

- [ ] `node scripts/check-packaged-render-runner.mjs` passes.
- [ ] `node scripts/check-visual-storytelling-prompts.mjs` passes.
- [ ] `npm.cmd run smoke:youtube-mock` passes.
- [ ] `npm.cmd run check` passes.
- [ ] `npm.cmd run electron:pack` succeeds.
- [ ] Packaged `Hermes YouTube Studio.exe` completes a Mock Media Mode job to 100%.
- [ ] Packaged `Hermes YouTube Studio.exe` completes a real Google Flow job to 100%.
- [ ] Latest final video exists and opens.
- [ ] `render-report-v2.json` shows `finalDuration` close to `subtitleEnd`.
- [ ] Extracted preview frame shows subtitles in the lower-middle safe zone, max 2 lines.
- [ ] `metadata.json` scene prompts are concrete and topic-specific, not generic “presenter reads script” prompts.
- [ ] `bot_data.db` records render failures in `task_failures`, and `/diagnose` can surface the latest render-runner failure evidence.

## Notes

- If the user still sees the Chromium cache error after this plan is implemented, first confirm they are running:

```text
C:\Users\amd\hermes\dist-electron\win-unpacked\Hermes YouTube Studio.exe
```

and that `resources\app.asar` timestamp is newer than the commit implementing this plan.

- Google Flow/Veo may add its own watermark. This plan avoids logos/readable text in prompts, but it cannot remove provider-added watermarks.

- The visual storytelling goal is not “no people ever.” It is “no boring repeated talking-head shots.” People can appear as users, operators, doctors, travelers, reporters, or observers when that makes the idea easier to understand.
