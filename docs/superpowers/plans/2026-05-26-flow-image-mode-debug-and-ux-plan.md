# Flow Image Mode Debug and UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hermes Studio's Google Flow image mode unambiguous, verifiable, and robust so selecting Image clearly creates Flow still images and then renders those images into the final YouTube video without misleading progress or 0-byte scene artifacts.

**Architecture:** Keep one final YouTube video pipeline, but split "Flow source media mode" from "final render output". Add explicit mode verification after Flow setup, artifact manifests after each scene download, and atomic temp-file rendering for image-to-video scene clips.

**Tech Stack:** Electron renderer/main, Playwright Google Flow automation, Node.js ESM services, ffmpeg-static, existing Hermes workflow contracts.

---

## Root Cause Evidence

Last inspected job:

`C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779769182837`

Findings:

- `job-request.json` contains `"flowOutputMode": "image"`, so the Electron UI value reached the workflow correctly.
- `scene_1_flow.jpg` is `720x1280`, `55642 bytes`.
- `scene_2_flow.jpg` is `720x1280`, `46349 bytes`.
- Therefore Google Flow source generation did produce still images, not video files, for the inspected job.
- Hermes then converted those Flow images into `scene_1.mp4`, because the final product is always a YouTube video.
- `scene_2.mp4` is `0 bytes`, while a direct repro render from `scene_2_flow.jpg` succeeded as `scene_2_repro.mp4`. This points to an interrupted or unguarded image-scene render path, not a bad Flow image.
- Current UI labels and progress copy do not explain this distinction, so "Image" selection looks like it is being ignored when the user sees `.mp4` scene files or the final video render stage.

## File Map

- Modify `electron/renderer/index.html`: Rename labels from generic "Google Flow 생성 방식" to source-specific wording.
- Modify `electron/renderer/app.js`: Update hint text, console details, and submitted payload summary.
- Modify `youtube-workflow-stages.mjs`: Emit separate progress phases for Flow source creation and image-to-video scene clip rendering.
- Modify `automation/google-flow-output-mode.mjs`: Return a structured verification result after selecting image or video mode.
- Modify `automation/google-flow-media.mjs`: Save Flow mode verification and media candidate diagnostics per scene.
- Modify `electron/services/image-scene-renderer.mjs`: Render image clips to `.tmp.mp4`, validate nonzero output, then atomically rename to final `scene_N.mp4`.
- Create `electron/services/flow-media-manifest.mjs`: Write per-scene source media manifests.
- Create `scripts/check-flow-image-mode-ux-contract.mjs`: Contract test for labels, hints, manifest fields, and progress wording.
- Modify `package.json`: Add the new contract test to the existing validation scripts.

---

### Task 1: Rename Image Mode as Flow Source Mode

**Files:**
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Test: `scripts/check-flow-image-mode-ux-contract.mjs`

- [ ] **Step 1: Create the failing UX contract test**

Create `scripts/check-flow-image-mode-ux-contract.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../electron/renderer/index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../electron/renderer/app.js", import.meta.url), "utf8");

assert.match(html, /Flow 원본 미디어|Flow source media/, "UI should describe image/video as Flow source media");
assert.match(app, /Flow 이미지 원본/, "image mode hint should say Flow image source");
assert.match(app, /최종 산출물은 영상/, "image mode hint should explain final output remains video");
assert.match(app, /Flow 영상 원본/, "video mode hint should say Flow video source");

console.log(JSON.stringify({ ok: true, checked: "flow-image-mode-ux-contract" }));
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
node scripts/check-flow-image-mode-ux-contract.mjs
```

Expected: FAIL because the UI still says generic `Google Flow 생성 방식`.

- [ ] **Step 3: Update UI copy**

In `electron/renderer/index.html`, change:

```html
<label>Google Flow 생성 방식</label>
```

to:

```html
<label>Flow 원본 미디어</label>
```

Change segmented labels:

```html
<span>Video</span>
<span>Image</span>
```

to:

```html
<span>Flow 영상 원본</span>
<span>Flow 이미지 원본</span>
```

- [ ] **Step 4: Update mode hint text**

In `electron/renderer/app.js`, replace `updateFlowOutputModeHint()` with:

```js
function updateFlowOutputModeHint() {
  if (!flowOutputModeHint) return;
  flowOutputModeHint.textContent = getFlowOutputMode() === "image"
    ? "Flow 이미지 원본: Google Flow에서 장면별 정지 이미지를 만들고, Hermes가 그 이미지를 움직이는 쇼츠 클립으로 변환합니다. 최종 산출물은 영상입니다."
    : "Flow 영상 원본: Google Flow에서 장면별 Veo 영상을 만들고, Hermes가 그대로 최종 쇼츠에 이어 붙입니다.";
}
```

- [ ] **Step 5: Run the UX contract test**

Run:

```powershell
node scripts/check-flow-image-mode-ux-contract.mjs
```

Expected: PASS.

---

### Task 2: Add Per-Scene Flow Media Manifests

**Files:**
- Create: `electron/services/flow-media-manifest.mjs`
- Modify: `youtube-workflow-stages.mjs`
- Test: `scripts/check-flow-image-mode-ux-contract.mjs`

- [ ] **Step 1: Extend the contract test**

Append to `scripts/check-flow-image-mode-ux-contract.mjs`:

```js
const stages = readFileSync(new URL("../youtube-workflow-stages.mjs", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../electron/services/flow-media-manifest.mjs", import.meta.url), "utf8");

assert.match(stages, /writeFlowMediaManifest/, "workflow should write source media manifests");
assert.match(manifest, /requestedFlowOutputMode/, "manifest should record requested Flow mode");
assert.match(manifest, /actualSourceExtension/, "manifest should record source extension");
assert.match(manifest, /sourceWidth/, "manifest should record image width when known");
assert.match(manifest, /sourceHeight/, "manifest should record image height when known");
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
node scripts/check-flow-image-mode-ux-contract.mjs
```

Expected: FAIL because the manifest service does not exist yet.

- [ ] **Step 3: Create manifest writer**

Create `electron/services/flow-media-manifest.mjs`:

```js
import { writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

export async function writeFlowMediaManifest({
  jobDir,
  sceneOrder,
  requestedFlowOutputMode,
  sourcePath,
  sourceContentType,
  sourceWidth = null,
  sourceHeight = null,
  renderedClipPath = null,
}) {
  const actualSourceExtension = extname(sourcePath || "").replace(".", "").toLowerCase();
  const manifest = {
    sceneOrder,
    requestedFlowOutputMode,
    sourcePath,
    sourceContentType,
    actualSourceExtension,
    sourceWidth,
    sourceHeight,
    renderedClipPath,
    finalProduct: "youtube-video",
    note: requestedFlowOutputMode === "image"
      ? "Flow created a still image source; Hermes renders it into a video clip for the final YouTube video."
      : "Flow created a video source; Hermes uses it as a scene clip for the final YouTube video.",
    updatedAt: new Date().toISOString(),
  };
  const path = join(jobDir, `scene_${sceneOrder}_flow_media_manifest.json`);
  await writeFile(path, JSON.stringify(manifest, null, 2), "utf8");
  return { path, manifest };
}
```

- [ ] **Step 4: Wire manifest writing in the workflow**

In `youtube-workflow-stages.mjs`, import:

```js
import { writeFlowMediaManifest } from "./electron/services/flow-media-manifest.mjs";
```

After Flow media is downloaded and before image-to-video rendering, call:

```js
await writeFlowMediaManifest({
  jobDir,
  sceneOrder: scene.order,
  requestedFlowOutputMode: job.options.flowOutputMode || "video",
  sourcePath: media.path,
  sourceContentType: media.contentType,
});
```

After image clip rendering succeeds, call again with `renderedClipPath: rendered.path`.

- [ ] **Step 5: Run the test**

Run:

```powershell
node scripts/check-flow-image-mode-ux-contract.mjs
```

Expected: PASS.

---

### Task 3: Verify Flow Mode Selection After Clicking

**Files:**
- Modify: `automation/google-flow-output-mode.mjs`
- Modify: `automation/google-flow-media.mjs`
- Test: `scripts/check-flow-output-mode-contract.mjs`

- [ ] **Step 1: Add contract assertions**

In `scripts/check-flow-output-mode-contract.mjs`, add:

```js
assert.match(outputModeHelper, /verifyFlowOutputMode/, "Flow mode helper should verify selected mode after clicking");
assert.match(outputModeHelper, /requestedOutputMode/, "verification should report requested output mode");
assert.match(outputModeHelper, /selectedOutputMode/, "verification should report selected output mode");
assert.match(flow, /flow_mode_verification/, "Flow automation should save mode verification evidence");
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
node scripts/check-flow-output-mode-contract.mjs
```

Expected: FAIL until the helper returns verification evidence.

- [ ] **Step 3: Implement verification result**

In `automation/google-flow-output-mode.mjs`, export:

```js
export async function verifyFlowOutputMode(page, requestedOutputMode) {
  return page.evaluate((requested) => {
    const text = document.body?.innerText || "";
    const selectedOutputMode = requested === "image" && /Nano Banana|Imagen|이미지|image/i.test(text)
      ? "image"
      : requested === "video" && /Veo|동영상|video/i.test(text)
        ? "video"
        : "unknown";
    return {
      requestedOutputMode: requested,
      selectedOutputMode,
      ok: selectedOutputMode === requested,
      textTail: text.slice(-1200),
    };
  }, requestedOutputMode);
}
```

- [ ] **Step 4: Save verification evidence**

In `automation/google-flow-media.mjs`, after `configureFlowOutputMode(page, outputMode)`, call verification and write:

```js
const modeVerification = await verifyFlowOutputMode(page, outputMode);
await writeFile(
  join(jobDir, `scene_${sceneOrder}_flow_mode_verification.json`),
  JSON.stringify(modeVerification, null, 2),
  "utf8",
);
if (!modeVerification.ok) {
  throw new Error(`Google Flow output mode verification failed: requested=${outputMode}, selected=${modeVerification.selectedOutputMode}`);
}
```

- [ ] **Step 5: Run the contract test**

Run:

```powershell
node scripts/check-flow-output-mode-contract.mjs
```

Expected: PASS.

---

### Task 4: Render Image Scene Clips Atomically

**Files:**
- Modify: `electron/services/image-scene-renderer.mjs`
- Test: `scripts/check-image-scene-renderer-contract.mjs`

- [ ] **Step 1: Add atomic render contract assertions**

In `scripts/check-image-scene-renderer-contract.mjs`, add:

```js
assert.match(service, /\.tmp\.mp4/, "image scene renderer should write to a temp mp4 first");
assert.match(service, /renameSync|rename\(/, "image scene renderer should atomically move temp output into place");
assert.match(service, /statSync|stat\(/, "image scene renderer should verify output size");
assert.match(service, /0-byte|zero-byte|nonempty/i, "image scene renderer should reject empty scene clips");
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
node scripts/check-image-scene-renderer-contract.mjs
```

Expected: FAIL because the current renderer writes directly to `scene_N.mp4`.

- [ ] **Step 3: Change renderer to temp output**

In `electron/services/image-scene-renderer.mjs`, change:

```js
outputPath,
```

inside ffmpeg args to:

```js
tmpOutputPath,
```

Define before args:

```js
const tmpOutputPath = `${outputPath}.tmp.mp4`;
```

After ffmpeg succeeds, validate:

```js
const stats = statSync(tmpOutputPath);
if (stats.size <= 0) {
  throw new Error(`Image scene render produced a zero-byte temp clip: ${tmpOutputPath}`);
}
renameSync(tmpOutputPath, outputPath);
```

Also remove any stale temp file before starting:

```js
rmSync(tmpOutputPath, { force: true });
```

- [ ] **Step 4: Run image renderer contract**

Run:

```powershell
node scripts/check-image-scene-renderer-contract.mjs
```

Expected: PASS.

---

### Task 5: Separate Progress Messages for Flow Image Source and Scene Clip Render

**Files:**
- Modify: `youtube-workflow-stages.mjs`
- Modify: `electron/renderer/app.js`
- Test: `scripts/check-desktop-progress-feedback.mjs`

- [ ] **Step 1: Add progress contract assertions**

In `scripts/check-desktop-progress-feedback.mjs`, add:

```js
assert.match(stages, /Flow 이미지 원본 생성/, "workflow should report Flow image source generation");
assert.match(stages, /이미지 원본을 영상 클립으로 변환/, "workflow should report image-to-video clip rendering");
assert.match(renderer, /final output remains video|최종 산출물은 영상/, "console should explain final render remains video");
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```powershell
node scripts/check-desktop-progress-feedback.mjs
```

Expected: FAIL until progress copy is updated.

- [ ] **Step 3: Update workflow messages**

When `flowOutputMode === "image"`, emit:

```js
message: `장면 ${scene.order} Flow 이미지 원본 생성 중입니다.`
```

Before `renderImageSceneClip`, emit:

```js
message: `장면 ${scene.order} 이미지 원본을 영상 클립으로 변환 중입니다. 최종 산출물은 영상입니다.`
```

When `flowOutputMode === "video"`, emit:

```js
message: `장면 ${scene.order} Flow 영상 원본 생성 중입니다.`
```

- [ ] **Step 4: Run progress contract**

Run:

```powershell
node scripts/check-desktop-progress-feedback.mjs
```

Expected: PASS.

---

### Task 6: Package and Verify

**Files:**
- Modify: `package.json`
- Build output: `dist-electron/`

- [ ] **Step 1: Add new contract test to package scripts**

In `package.json`, add the new script:

```json
"check:flow-image-mode-ux": "node scripts/check-flow-image-mode-ux-contract.mjs"
```

Add it to the existing local validation command if one exists.

- [ ] **Step 2: Run focused checks**

Run:

```powershell
npm.cmd run check:flow-output-mode
npm.cmd run check:flow-image-mode-ux
node scripts/check-desktop-progress-feedback.mjs
node scripts/check-image-scene-renderer-contract.mjs
```

Expected: all PASS.

- [ ] **Step 3: Run mock smoke test**

Run:

```powershell
npm.cmd run smoke:youtube-mock
```

Expected: PASS with a final `.mp4` path.

- [ ] **Step 4: Rebuild Electron package**

Run:

```powershell
Get-Process | Where-Object { $_.ProcessName -eq "Hermes YouTube Studio" } | Stop-Process -Force
npm.cmd run electron:pack
```

Expected: `dist-electron/Hermes YouTube Studio Setup 1.0.0.exe` is updated.

- [ ] **Step 5: Verify desktop shortcut**

Run:

```powershell
node scripts/check-packaged-runtime-contract.mjs
node scripts/check-desktop-shortcut-launcher.mjs
```

Expected: both PASS.

---

## Acceptance Criteria

- Selecting Flow Image Source writes `flowOutputMode: "image"` to `job-request.json`.
- Each scene writes `scene_N_flow_media_manifest.json`.
- Image mode creates source files such as `scene_N_flow.jpg` or `scene_N_flow.png`.
- Image mode may still create `scene_N.mp4`, but the manifest and UI explain this is Hermes converting the still image into a final video clip.
- No final `scene_N.mp4` is left at `0 bytes`; failed renders leave only temp files plus explicit error messages.
- Progress UI distinguishes:
  - Flow image source creation
  - image source to video clip conversion
  - final YouTube video render
- The user no longer has to infer whether Flow generated an image or video from file extensions alone.

