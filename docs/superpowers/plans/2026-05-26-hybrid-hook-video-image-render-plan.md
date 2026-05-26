# Hybrid Hook Video + Image Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Hermes Studio mode where the first N script sentences/scenes are generated as Google Flow videos for stronger opening attention, while the remaining scenes are generated as Google Flow images and rendered into smooth motion clips.

**Architecture:** Extend the current job option `flowOutputMode` from whole-job `video|image` into `video|image|hybrid`, with a companion `hybridIntroVideoSceneCount` numeric option. Scene planning assigns each scene an `outputMode`, Flow generation uses that per-scene mode, and final rendering standardizes every scene to the same 1080x1920 / CFR / yuv420p / AAC-safe timeline before concatenation.

**Tech Stack:** Electron renderer UI, Node/Electron services, Playwright Google Flow automation, FFmpeg/ffprobe, Supertonic local TTS, existing Hermes scene planner and QA scripts.

---

## Research Notes

- FFmpeg `xfade` can create smooth scene transitions, but both inputs must have the same resolution, pixel format, frame rate, and timebase. This directly supports a pre-normalization step before final concatenation. Source: https://ffmpeg.org/ffmpeg-filters.html
- FFmpeg `zoompan` is the right primitive for turning still images into motion clips; it supports zoom, x/y pan, duration in frames, output size, and fps. Source: https://ffmpeg.org/ffmpeg-filters.html
- FFmpeg concat warns that desync can happen at stitches when audio/video durations do not match, so Hermes should continue per-scene audio sync and only concatenate already-synced scene clips. Source: https://ffmpeg.org/ffmpeg-filters.html
- Slideshow/video automation projects solve mixed image durations by hiding per-run FFmpeg complexity behind a single config. Hermes should not add a large dependency yet, but should borrow that architecture: a normalized scene manifest drives rendering. Source: https://github.com/0x464e/slideshow-video
- Remotion is strong for future UI-driven video composition, but it adds a React rendering stack and licensing considerations for automation. Keep this phase on FFmpeg because Hermes already ships and tests FFmpeg render scripts. Source: https://www.remotion.dev/
- A simple timeline API pattern is useful: clips can be typed as image or video and transitions can be declared per clip. Hermes should create `scene-render-manifest.json` with equivalent clip metadata. Source: https://www.simple-ffmpegjs.com/examples/clips-and-transitions
- `HERMES_HYBRID_RENDER_REVIEW.md` correctly identifies the main risk: heterogeneous Flow videos and image-derived clips must be normalized before final render. It also correctly calls out hook-video duration risk and per-scene observability gaps.
- The review's recommendation to inject silent audio into intermediate normalized clips is not adopted for Phase 1. Hermes currently adds real TTS audio in `renderSceneVideo()` and concatenates `scene_N_synced.mp4`; adding silent audio to pre-TTS clips would be redundant and can make stream ownership harder to reason about.

## Current Code Map

- `C:\Users\amd\hermes\youtube-job-schema.mjs`: normalizes job options; currently only accepts `flowOutputMode: "video"|"image"`.
- `C:\Users\amd\hermes\electron\renderer\index.html`: exposes the Google Flow output mode segmented control.
- `C:\Users\amd\hermes\electron\renderer\app.js`: reads `flowOutputMode` and submits it to the job service.
- `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`: maps renderer input into normalized job options.
- `C:\Users\amd\hermes\electron\services\script-planner.mjs`: creates sentence-proportional scenes and prompts; currently receives one `flowOutputMode`.
- `C:\Users\amd\hermes\youtube-workflow-stages.mjs`: calls Google Flow and currently uses one job-level output mode for every scene.
- `C:\Users\amd\hermes\electron\services\image-scene-renderer.mjs`: converts Flow images into short motion MP4 clips using FFmpeg `zoompan`.
- `C:\Users\amd\hermes\scripts\render-youtube-with-tts.mjs`: syncs each `scene_N.mp4` to TTS audio, writes subtitles, concatenates synced scenes, and burns subtitles.

## Product Design

Add a third Google Flow mode:

- `Video`: every scene is generated as Flow video.
- `Image`: every scene is generated as Flow image, then converted to motion clip.
- `Hybrid`: first N scenes are Flow video; remaining scenes are Flow image.

UI text:

- Label: `Opening video scenes`
- Control: number input or small stepper beside Hybrid mode.
- Default: `2`
- Allowed range: `0` to `6`, clamped to actual scene count.
- Helper: `Hybrid: first N scenes use Flow video for the hook; the rest use Nano Banana Pro image clips for consistency and speed.`

Recommended initial behavior:

- For 30s/45s videos: default N = 1.
- For 60s/90s/custom videos: default N = 2.
- If the user enters `0`, Hybrid behaves like Image mode but keeps the per-scene planner path.
- If N is greater than scene count, every scene becomes video and a warning is logged.

## Rendering Design

Every generated scene must become a local `scene_N.mp4` before final TTS render. The render pipeline then treats all scenes uniformly.

For Flow video scenes:

- Download original Flow video.
- Normalize to 1080x1920, 30fps, yuv420p, H.264, no audio.
- Apply the same subtle fade in/out polish used by image-derived clips so the visual language is consistent across Flow video and Nano Banana Pro image scenes.
- If video is shorter than narration audio, use existing duration policy. If extension would cause freeze risk, fail with regeneration guidance rather than stretching too far.
- Prevent this before rendering by constraining Gemini/HPSL hook scene narration when Hybrid mode is selected: first N video-hook scenes should stay short enough for Flow's usual short video duration.

For Flow image scenes:

- Download Nano Banana Pro image.
- Convert to a motion clip using `renderImageSceneClip`.
- Improve the image motion presets from two choices to a deterministic cycle:
  - `slow-zoom-in`
  - `slow-zoom-out`
  - `slow-pan-left`
  - `slow-pan-right`
  - `subtle-push-in`
- Target duration initially equals `scene.duration_seconds`; final sync still uses actual TTS duration.

For scene transitions:

- Phase 1: keep current concat-based final render after per-scene sync. Add `fade` in/out inside each scene clip to reduce visual cuts without risking concat desync.
- Phase 2: after Phase 1 is stable, add optional `xfade` only between already-normalized no-audio scene streams, then remap final narration audio/subtitles. This is not first implementation because `xfade` requires exact matching stream properties.

For observability:

- Emit per-scene `sceneOutputMode`, `sceneRenderPhase`, `motionPreset`, `sourceMediaPath`, and `normalizedPath` in workflow progress details.
- Rely on the existing `workflow-db-events.mjs` mirror, which already serializes `event.details` into `task_events.data_json`; no SQLite schema change is needed.
- Add explicit progress phases such as `hybrid-scene-render`, `flow-video-normalize`, and `flow-image-motion-render` so console filtering and later diagnosis can identify which scene stalled.

---

### Task 1: Job Schema Contract for Hybrid Mode

**Files:**
- Modify: `C:\Users\amd\hermes\youtube-job-schema.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-youtube-job-schema.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-flow-output-mode-contract.mjs`

- [ ] **Step 1: Write the failing schema tests**

Add these assertions to `C:\Users\amd\hermes\scripts\check-youtube-job-schema.mjs`:

```js
const hybridJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: { flowOutputMode: "hybrid", hybridIntroVideoSceneCount: 2 },
});
assert.equal(hybridJob.options.flowOutputMode, "hybrid");
assert.equal(hybridJob.options.hybridIntroVideoSceneCount, 2);

const clampedHybridJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: { flowOutputMode: "hybrid", hybridIntroVideoSceneCount: 99 },
});
assert.equal(clampedHybridJob.options.hybridIntroVideoSceneCount, 6);
```

Add this assertion to `C:\Users\amd\hermes\scripts\check-flow-output-mode-contract.mjs`:

```js
assert.match(schema, /hybridIntroVideoSceneCount/, "schema should define the hybrid opening video scene count");
assert.match(schema, /\["video", "image", "hybrid"\]/, "schema should accept hybrid Flow output mode");
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
node scripts/check-youtube-job-schema.mjs
node scripts/check-flow-output-mode-contract.mjs
```

Expected: both fail because `hybrid` and `hybridIntroVideoSceneCount` are not implemented.

- [ ] **Step 3: Implement schema normalization**

In `C:\Users\amd\hermes\youtube-job-schema.mjs`, change defaults and validation:

```js
flowOutputMode: "video",
hybridIntroVideoSceneCount: 2,
```

Replace the mode validation block with:

```js
options.flowOutputMode = String(options.flowOutputMode || "video").toLowerCase();
if (!["video", "image", "hybrid"].includes(options.flowOutputMode)) {
  throw new Error(`Unknown flowOutputMode: ${options.flowOutputMode}`);
}
options.hybridIntroVideoSceneCount = Math.max(0, Math.min(6, Math.round(Number(options.hybridIntroVideoSceneCount ?? 2))));
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```powershell
node scripts/check-youtube-job-schema.mjs
node scripts/check-flow-output-mode-contract.mjs
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add youtube-job-schema.mjs scripts/check-youtube-job-schema.mjs scripts/check-flow-output-mode-contract.mjs
git commit -m "feat: add hybrid flow output schema"
```

### Task 2: Studio UI for Hybrid and Opening Scene Count

**Files:**
- Modify: `C:\Users\amd\hermes\electron\renderer\index.html`
- Modify: `C:\Users\amd\hermes\electron\renderer\app.js`
- Modify: `C:\Users\amd\hermes\electron\renderer\styles.css`
- Modify: `C:\Users\amd\hermes\scripts\check-studio-v2-ux.mjs`

- [ ] **Step 1: Write failing UI contract tests**

Add to `C:\Users\amd\hermes\scripts\check-studio-v2-ux.mjs`:

```js
assert.match(html, /value="hybrid"/, "UI should expose Hybrid Google Flow mode");
assert.match(html, /id="hybridIntroVideoSceneCount"/, "UI should expose opening video scene count");
assert.match(app, /hybridIntroVideoSceneCount:\s*getHybridIntroVideoSceneCount\(\)/, "job payload should include hybrid opening scene count");
assert.match(app, /updateHybridFlowControls/, "renderer should show hybrid-only controls and update hints");
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
node scripts/check-studio-v2-ux.mjs
```

Expected: FAIL because Hybrid UI does not exist.

- [ ] **Step 3: Add Hybrid radio and count input**

In `C:\Users\amd\hermes\electron\renderer\index.html`, extend `#flowOutputModeControl`:

```html
<label><input type="radio" name="flowOutputMode" value="hybrid"><span>Hybrid</span></label>
```

Add below `flowOutputModeHint`:

```html
<div id="hybridFlowControls" class="hybrid-controls" hidden>
  <label for="hybridIntroVideoSceneCount">Opening video scenes</label>
  <input id="hybridIntroVideoSceneCount" type="number" min="0" max="6" value="2">
  <div id="hybridFlowPreview" class="preset-preview">First 2 scenes: video · remaining scenes: image</div>
</div>
```

- [ ] **Step 4: Wire renderer state**

In `C:\Users\amd\hermes\electron\renderer\app.js`, add DOM refs:

```js
const hybridFlowControls = document.querySelector("#hybridFlowControls");
const hybridIntroVideoSceneCount = document.querySelector("#hybridIntroVideoSceneCount");
const hybridFlowPreview = document.querySelector("#hybridFlowPreview");
```

Add helpers:

```js
function getHybridIntroVideoSceneCount() {
  return Math.max(0, Math.min(6, Math.round(Number(hybridIntroVideoSceneCount?.value || 2))));
}

function updateHybridFlowControls() {
  const mode = getFlowOutputMode();
  if (hybridFlowControls) hybridFlowControls.hidden = mode !== "hybrid";
  if (hybridFlowPreview) {
    const count = getHybridIntroVideoSceneCount();
    hybridFlowPreview.textContent = `First ${count} scene${count === 1 ? "" : "s"}: video · remaining scenes: image`;
  }
}
```

Update `readJobInput()`:

```js
hybridIntroVideoSceneCount: getHybridIntroVideoSceneCount(),
```

Update `updateFlowOutputModeHint()`:

```js
if (getFlowOutputMode() === "hybrid") {
  flowOutputModeHint.textContent = "Hybrid: opening scenes use Flow video for motion and attention; later scenes use Nano Banana Pro images rendered as smooth motion clips.";
} else if (getFlowOutputMode() === "image") {
  flowOutputModeHint.textContent = "Image: Google Flow creates Nano Banana Pro images and Hermes renders them into moving clips.";
} else {
  flowOutputModeHint.textContent = "Video: Google Flow creates Veo video clips for every scene.";
}
updateHybridFlowControls();
```

Add listeners:

```js
hybridIntroVideoSceneCount?.addEventListener("input", updateHybridFlowControls);
```

- [ ] **Step 5: Add compact styling**

In `C:\Users\amd\hermes\electron\renderer\styles.css`:

```css
.hybrid-controls {
  display: grid;
  grid-template-columns: 1fr 92px;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}

.hybrid-controls[hidden] {
  display: none;
}

.hybrid-controls .preset-preview {
  grid-column: 1 / -1;
}
```

- [ ] **Step 6: Run UI test**

Run:

```powershell
node scripts/check-studio-v2-ux.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add electron/renderer/index.html electron/renderer/app.js electron/renderer/styles.css scripts/check-studio-v2-ux.mjs
git commit -m "feat: add hybrid flow controls to studio"
```

### Task 3: Per-Scene Output Mode Planning

**Files:**
- Create: `C:\Users\amd\hermes\electron\services\scene-output-mode-policy.mjs`
- Modify: `C:\Users\amd\hermes\electron\services\script-planner.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-hybrid-scene-output-policy.mjs`
- Modify: `C:\Users\amd\hermes\package.json`

- [ ] **Step 1: Write failing policy test**

Create `C:\Users\amd\hermes\scripts\check-hybrid-scene-output-policy.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { assignSceneOutputModes } from "../electron/services/scene-output-mode-policy.mjs";
import { planScenesFromScript } from "../electron/services/script-planner.mjs";

const scenes = [
  { order: 1, narration: "Hook one." },
  { order: 2, narration: "Hook two." },
  { order: 3, narration: "Point." },
  { order: 4, narration: "Lesson." },
];

assert.deepEqual(assignSceneOutputModes({ scenes, flowOutputMode: "video", hybridIntroVideoSceneCount: 2 }).map((s) => s.outputMode), ["video", "video", "video", "video"]);
assert.deepEqual(assignSceneOutputModes({ scenes, flowOutputMode: "image", hybridIntroVideoSceneCount: 2 }).map((s) => s.outputMode), ["image", "image", "image", "image"]);
assert.deepEqual(assignSceneOutputModes({ scenes, flowOutputMode: "hybrid", hybridIntroVideoSceneCount: 2 }).map((s) => s.outputMode), ["video", "video", "image", "image"]);

const planned = planScenesFromScript({
  script: "첫 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다.",
  title: "테스트",
  targetSeconds: 30,
  flowOutputMode: "hybrid",
  hybridIntroVideoSceneCount: 1,
});
assert.equal(planned[0].outputMode, "video");
assert.ok(planned.slice(1).every((scene) => scene.outputMode === "image"));
assert.match(planned[0].image_prompt, /Output mode: video/i);
assert.match(planned[1].image_prompt, /Output mode: image/i);

console.log(JSON.stringify({ ok: true, checked: "hybrid-scene-output-policy" }));
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
node scripts/check-hybrid-scene-output-policy.mjs
```

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Create policy module**

Create `C:\Users\amd\hermes\electron\services\scene-output-mode-policy.mjs`:

```js
export function outputModeForScene({ sceneOrder, flowOutputMode = "video", hybridIntroVideoSceneCount = 2 } = {}) {
  const mode = String(flowOutputMode || "video").toLowerCase();
  const order = Math.max(1, Number(sceneOrder || 1));
  const introCount = Math.max(0, Math.min(6, Math.round(Number(hybridIntroVideoSceneCount ?? 2))));
  if (mode === "hybrid") return order <= introCount ? "video" : "image";
  if (mode === "image") return "image";
  return "video";
}

export function assignSceneOutputModes({ scenes = [], flowOutputMode = "video", hybridIntroVideoSceneCount = 2 } = {}) {
  return scenes.map((scene, index) => ({
    ...scene,
    outputMode: outputModeForScene({
      sceneOrder: scene.order || index + 1,
      flowOutputMode,
      hybridIntroVideoSceneCount,
    }),
  }));
}
```

- [ ] **Step 4: Integrate planner**

In `C:\Users\amd\hermes\electron\services\script-planner.mjs`, import:

```js
import { assignSceneOutputModes, outputModeForScene } from "./scene-output-mode-policy.mjs";
```

Update exported planner signatures to accept `hybridIntroVideoSceneCount = 2`.

Where each scene is created, compute:

```js
const outputMode = outputModeForScene({
  sceneOrder: order,
  flowOutputMode,
  hybridIntroVideoSceneCount,
});
```

Set on scene:

```js
outputMode,
flowOutputMode: outputMode,
image_prompt: buildVisualStoryPrompt({
  title,
  narration,
  order,
  visualCategory,
  characterProfile,
  stylePreset,
  characterSheet,
  flowOutputMode: outputMode,
}),
```

For any existing code that builds all scenes first, apply:

```js
return assignSceneOutputModes({ scenes, flowOutputMode, hybridIntroVideoSceneCount });
```

but make sure prompts are rebuilt with the per-scene `outputMode`, not the job-level mode.

- [ ] **Step 5: Add test to package check**

In `C:\Users\amd\hermes\package.json`, add `node scripts/check-hybrid-scene-output-policy.mjs` to the existing `check` script sequence.

- [ ] **Step 6: Run test and verify pass**

Run:

```powershell
node scripts/check-hybrid-scene-output-policy.mjs
npm run check
```

Expected: policy test passes; full check passes.

- [ ] **Step 7: Commit**

```powershell
git add electron/services/scene-output-mode-policy.mjs electron/services/script-planner.mjs scripts/check-hybrid-scene-output-policy.mjs package.json
git commit -m "feat: assign hybrid output mode per scene"
```

### Task 4: Workflow Uses Per-Scene Output Mode

**Files:**
- Modify: `C:\Users\amd\hermes\youtube-workflow.mjs`
- Modify: `C:\Users\amd\hermes\youtube-workflow-stages.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-flow-output-mode-contract.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-desktop-progress-feedback.mjs`

- [ ] **Step 1: Write failing workflow contract tests**

Add to `C:\Users\amd\hermes\scripts\check-flow-output-mode-contract.mjs`:

```js
assert.match(stages, /scene\.outputMode\s*\|\|\s*scene\.flowOutputMode\s*\|\|\s*job\?\.options\?\.flowOutputMode/, "scene media generation should prefer per-scene output mode");
assert.match(stages, /hybridIntroVideoSceneCount/, "workflow stages should preserve hybrid opening scene count in progress details");
```

Add to `C:\Users\amd\hermes\scripts\check-desktop-progress-feedback.mjs`:

```js
assert.match(stages, /sceneOutputMode/, "progress events should include the actual per-scene output mode");
assert.match(stages, /hybrid-scene-render|flow-video-normalize|flow-image-motion-render/, "progress events should identify hybrid per-scene render phases");
assert.match(workflowDbEvents, /details:\s*event\.details/, "workflow DB mirror should preserve per-scene hybrid render details in task_events");
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
node scripts/check-flow-output-mode-contract.mjs
node scripts/check-desktop-progress-feedback.mjs
```

Expected: FAIL because workflow still uses only job-level mode.

- [ ] **Step 3: Pass hybrid count into planners**

In `C:\Users\amd\hermes\youtube-workflow.mjs`, when calling `planScenesFromHpsl` and `planScenesFromScript`, include:

```js
hybridIntroVideoSceneCount: job.options.hybridIntroVideoSceneCount,
```

In scene-planning progress details, include:

```js
flowOutputMode: job.options.flowOutputMode || "video",
hybridIntroVideoSceneCount: job.options.hybridIntroVideoSceneCount,
sceneOutputModes: draft.scenes.map((scene) => ({
  order: scene.order,
  outputMode: scene.outputMode || scene.flowOutputMode || job.options.flowOutputMode || "video",
})),
```

- [ ] **Step 4: Use per-scene mode in generation**

In `C:\Users\amd\hermes\youtube-workflow-stages.mjs`, replace:

```js
const outputMode = job?.options?.flowOutputMode || "video";
```

with:

```js
const outputMode = scene.outputMode || scene.flowOutputMode || job?.options?.flowOutputMode || "video";
```

Update progress details:

```js
details: {
  sceneOrder: scene.order,
  flowOutputMode: job?.options?.flowOutputMode || "video",
  sceneOutputMode: outputMode,
  hybridIntroVideoSceneCount: job?.options?.hybridIntroVideoSceneCount,
},
```

Update `onProgress` details:

```js
details: {
  ...details,
  flowOutputMode: job?.options?.flowOutputMode || "video",
  sceneOutputMode: outputMode,
},
```

Add scene render/normalization progress events before and after local conversion:

```js
context.emit?.({
  type: "workflow-progress",
  jobId: job?.id || context.job?.id || "",
  phase: outputMode === "image" ? "flow-image-motion-render" : "flow-video-normalize",
  message: `Scene ${scene.order} ${outputMode} media is being normalized for final render.`,
  details: {
    flowOutputMode: job?.options?.flowOutputMode || "video",
    hybridIntroVideoSceneCount: job?.options?.hybridIntroVideoSceneCount,
    sceneOrder: scene.order,
    sceneOutputMode: outputMode,
    sceneRenderPhase: outputMode === "image" ? "image-to-motion-clip" : "flow-video-normalize",
  },
});
```

- [ ] **Step 5: Run workflow contract tests**

Run:

```powershell
node scripts/check-flow-output-mode-contract.mjs
node scripts/check-desktop-progress-feedback.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add youtube-workflow.mjs youtube-workflow-stages.mjs scripts/check-flow-output-mode-contract.mjs scripts/check-desktop-progress-feedback.mjs
git commit -m "feat: generate hybrid scenes with per-scene modes"
```

### Task 5: Hybrid Hook Narration Guard

**Files:**
- Modify: `C:\Users\amd\hermes\automation\gemini-research-draft.mjs`
- Modify: `C:\Users\amd\hermes\electron\services\direct-script-draft-service.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-hybrid-hook-narration-guard.mjs`
- Modify: `C:\Users\amd\hermes\package.json`

- [ ] **Step 1: Write failing hook guard test**

Create `C:\Users\amd\hermes\scripts\check-hybrid-hook-narration-guard.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const geminiDraft = readFileSync(new URL("../automation/gemini-research-draft.mjs", import.meta.url), "utf8");
const directDraft = readFileSync(new URL("../electron/services/direct-script-draft-service.mjs", import.meta.url), "utf8");

assert.match(geminiDraft, /hybridIntroVideoSceneCount/, "Gemini prompt should know how many opening scenes are Flow videos");
assert.match(geminiDraft, /35\uc790|35 characters|35 chars|35 Korean characters/i, "Gemini prompt should cap hybrid hook narration length");
assert.match(geminiDraft, /Flow video|Veo|opening video/i, "Gemini prompt should explain why hook scenes must be short");
assert.match(directDraft, /hybrid_hook_narration_warning|hybridHookNarrationWarning/, "direct script mode should flag overly long hybrid hook scenes");

console.log(JSON.stringify({ ok: true, checked: "hybrid-hook-narration-guard" }));
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
node scripts/check-hybrid-hook-narration-guard.mjs
```

Expected: FAIL because Gemini and direct script draft paths do not yet carry Hybrid hook-specific narration constraints.

- [ ] **Step 3: Add Gemini hook constraint**

In `C:\Users\amd\hermes\automation\gemini-research-draft.mjs`, where the draft-generation prompt is assembled, add a conditional instruction block:

```js
const hybridHookInstruction = job?.options?.flowOutputMode === "hybrid"
  ? [
      `Hybrid Flow mode is enabled.`,
      `The first ${Number(job.options.hybridIntroVideoSceneCount || 2)} planned scenes will be generated as Google Flow video/Veo clips.`,
      `For those opening video scenes, keep each Korean narration sentence under 35 Korean characters including spaces when possible.`,
      `The reason is practical: Flow video clips are short, and long hook narration causes freeze-frame stretching during render.`,
      `Later image scenes may be longer because Hermes renders Nano Banana Pro images as motion clips.`,
    ].join("\n")
  : "";
```

Include `${hybridHookInstruction}` in the prompt text near the existing HPSL/scene instructions.

- [ ] **Step 4: Add direct-script warning metadata**

In `C:\Users\amd\hermes\electron\services\direct-script-draft-service.mjs`, after scenes are built, add:

```js
const hybridIntroCount = Math.max(0, Math.min(6, Math.round(Number(job.options?.hybridIntroVideoSceneCount ?? 2))));
if (job.options?.flowOutputMode === "hybrid") {
  for (const scene of scenes) {
    const chars = Array.from(String(scene.narration || "").replace(/\s+/g, " ").trim()).length;
    if (scene.order <= hybridIntroCount && chars > 45) {
      scene.hybrid_hook_narration_warning = {
        code: "hybrid-hook-narration-long",
        chars,
        recommendedMaxChars: 35,
        message: "Opening Hybrid Flow video narration is long; split this sentence or reduce opening video scene count to avoid freeze-frame stretching.",
      };
    }
  }
}
```

- [ ] **Step 5: Surface warning through existing QA**

If `direct-script-draft-service.mjs` already has a `qualityWarnings` or scene metadata area, append the warning there too. If it does not, scene-level metadata is enough for this phase because `draft.json` and progress artifacts preserve scenes.

- [ ] **Step 6: Run test and verify pass**

Run:

```powershell
node scripts/check-hybrid-hook-narration-guard.mjs
npm run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add automation/gemini-research-draft.mjs electron/services/direct-script-draft-service.mjs scripts/check-hybrid-hook-narration-guard.mjs package.json
git commit -m "feat: guard hybrid hook narration length"
```

### Task 6: Smooth Mixed Media Rendering

**Files:**
- Modify: `C:\Users\amd\hermes\electron\services\image-scene-renderer.mjs`
- Create: `C:\Users\amd\hermes\electron\services\scene-video-normalizer.mjs`
- Modify: `C:\Users\amd\hermes\youtube-workflow-stages.mjs`
- Modify: `C:\Users\amd\hermes\scripts\render-youtube-with-tts.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-hybrid-render-normalization.mjs`
- Modify: `C:\Users\amd\hermes\package.json`

- [ ] **Step 1: Write failing normalization test**

Create `C:\Users\amd\hermes\scripts\check-hybrid-render-normalization.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const normalizer = readFileSync(new URL("../electron/services/scene-video-normalizer.mjs", import.meta.url), "utf8");
const imageRenderer = readFileSync(new URL("../electron/services/image-scene-renderer.mjs", import.meta.url), "utf8");
const stages = readFileSync(new URL("../youtube-workflow-stages.mjs", import.meta.url), "utf8");
const renderScript = readFileSync(new URL("../scripts/render-youtube-with-tts.mjs", import.meta.url), "utf8");

assert.match(normalizer, /normalizeSceneVideoClip/, "should expose scene video normalization");
assert.match(normalizer, /scale=1080:1920:force_original_aspect_ratio=increase/, "normalizer should standardize vertical resolution");
assert.match(normalizer, /fps=30/, "normalizer should force constant 30fps");
assert.match(normalizer, /format=yuv420p/, "normalizer should force yuv420p");
assert.match(normalizer, /fade=t=in/, "Flow video clips should fade in like image clips");
assert.match(normalizer, /fade=t=out/, "Flow video clips should fade out like image clips");
assert.doesNotMatch(normalizer, /anullsrc/, "intermediate normalized clips should not inject silent audio before TTS sync");
assert.match(imageRenderer, /fade=t=in/, "image clips should fade in");
assert.match(imageRenderer, /fade=t=out/, "image clips should fade out");
assert.match(stages, /normalizeSceneVideoClip/, "Flow video scenes should be normalized before final render");
assert.match(renderScript, /scene-render-manifest\.json/, "final render should write a scene render manifest");

console.log(JSON.stringify({ ok: true, checked: "hybrid-render-normalization" }));
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
node scripts/check-hybrid-render-normalization.mjs
```

Expected: FAIL because the normalizer and manifest do not exist.

- [ ] **Step 3: Create video normalizer**

Create `C:\Users\amd\hermes\electron\services\scene-video-normalizer.mjs`:

```js
import { spawnSync } from "node:child_process";
import { resolveFfmpegBin } from "./ffmpeg-bin-resolver.mjs";

function tailText(text = "", limit = 2200) {
  const value = String(text || "");
  return value.length > limit ? value.slice(-limit) : value;
}

export function normalizeSceneVideoClip({ ffmpegBin, inputPath, outputPath, durationSeconds }) {
  const resolvedFfmpegBin = resolveFfmpegBin(ffmpegBin);
  if (!resolvedFfmpegBin) throw new Error("ffmpegBin is required for scene video normalization.");
  if (!inputPath) throw new Error("inputPath is required for scene video normalization.");
  if (!outputPath) throw new Error("outputPath is required for scene video normalization.");

  const duration = Math.max(1, Number(durationSeconds || 8));
  const fadeDuration = Math.min(0.35, Math.max(0.15, duration / 12));
  const fadeOutStart = Math.max(0, duration - fadeDuration);
  const vf = [
    "scale=1080:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    "fps=30",
    "setsar=1",
    `fade=t=in:st=0:d=${fadeDuration.toFixed(3)}`,
    `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeDuration.toFixed(3)}`,
    "format=yuv420p",
  ].join(",");

  const args = [
    "-y",
    "-i", inputPath,
    "-an",
    "-vf", vf,
    "-r", "30",
    "-t", String(duration),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outputPath,
  ];

  const result = spawnSync(resolvedFfmpegBin, args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 8 });
  if (result.status !== 0) {
    throw new Error(`Scene video normalize failed: code=${result.status}\nffmpeg=${resolvedFfmpegBin}\nargs=${args.join(" ")}\nSTDOUT_TAIL:\n${tailText(result.stdout)}\nSTDERR_TAIL:\n${tailText(result.stderr)}`);
  }

  return { path: outputPath, ffmpegBin: resolvedFfmpegBin };
}
```

- [ ] **Step 4: Add fade-safe image clips**

In `C:\Users\amd\hermes\electron\services\image-scene-renderer.mjs`, change output to 30fps and add fades:

```js
const fps = 30;
const fadeDuration = Math.min(0.35, Math.max(0.15, duration / 12));
const fadeOutStart = Math.max(0, duration - fadeDuration);
const scaleAndCrop = "scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304";
const motion = motionPreset === "slow-pan-left"
  ? `zoompan=z='1.10':x='iw*0.05-(iw*0.08)*on/(${fps}*${duration})':y='ih*0.02':d=1:s=1080x1920:fps=${fps}`
  : `zoompan=z='min(zoom+0.0010,1.14)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${fps}`;
const polish = `fade=t=in:st=0:d=${fadeDuration.toFixed(3)},fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeDuration.toFixed(3)},format=yuv420p`;
```

Use filter:

```js
"-vf", `${scaleAndCrop},${motion},${polish}`,
"-r", String(fps),
```

- [ ] **Step 5: Normalize Flow video scenes**

In `C:\Users\amd\hermes\youtube-workflow-stages.mjs`, import:

```js
import { normalizeSceneVideoClip } from "./electron/services/scene-video-normalizer.mjs";
```

In the video output branch, copy/download to a raw path first:

```js
const extension = mediaExtension(media.contentType, media.path);
const rawPath = join(jobDir, `scene_${scene.order}_flow_raw.${extension}`);
if (media.path !== rawPath) await copyFile(media.path, rawPath);
const renderPath = join(jobDir, `scene_${scene.order}.mp4`);
const normalized = normalizeSceneVideoClip({
  ffmpegBin: context.ffmpegBin,
  inputPath: rawPath,
  outputPath: renderPath,
  durationSeconds: scene.duration_seconds || 8,
});
return {
  path: renderPath,
  originalPath: media.path,
  rawPath,
  bytes: media.bytes,
  contentType: "video/mp4",
  sourceContentType: media.contentType,
  flowOutputMode: "video",
  normalized: normalized.path,
};
```

- [ ] **Step 6: Write scene render manifest**

In `C:\Users\amd\hermes\scripts\render-youtube-with-tts.mjs`, before writing `render-report-v2.json`, write:

```js
const sceneRenderManifestPath = join(JOB_DIR, "scene-render-manifest.json");
writeFileSync(sceneRenderManifestPath, JSON.stringify({
  ok: true,
  standard: {
    width: 1080,
    height: 1920,
    fps: 30,
    pixelFormat: "yuv420p",
    audio: "per-scene-aac",
  },
  scenes: renderReport.map((item) => ({
    order: item.order,
    finalScene: item.finalScene.replace(/\\/g, "/"),
    videoDuration: item.videoDuration,
    audioDuration: item.audioDuration,
    ratio: item.ratio,
    strategy: item.strategy,
  })),
}, null, 2), "utf8");
```

Add `sceneRenderManifestPath` to the final report JSON.

- [ ] **Step 7: Add package check**

Add `node scripts/check-hybrid-render-normalization.mjs` to `package.json` check script.

- [ ] **Step 8: Run tests**

Run:

```powershell
node scripts/check-hybrid-render-normalization.mjs
npm run check
npm run smoke:youtube-mock
```

Expected: all pass.

- [ ] **Step 9: Commit**

```powershell
git add electron/services/scene-video-normalizer.mjs electron/services/image-scene-renderer.mjs youtube-workflow-stages.mjs scripts/render-youtube-with-tts.mjs scripts/check-hybrid-render-normalization.mjs package.json
git commit -m "feat: normalize mixed video and image scene rendering"
```

### Task 7: Hybrid End-to-End Smoke Test

**Files:**
- Create: `C:\Users\amd\hermes\scripts\smoke-electron-youtube-hybrid-mock-job.mjs`
- Modify: `C:\Users\amd\hermes\package.json`

- [ ] **Step 1: Create smoke test**

Create `C:\Users\amd\hermes\scripts\smoke-electron-youtube-hybrid-mock-job.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";
import { createDefaultYouTubeStages } from "../youtube-workflow-stages.mjs";
import { generateYouTubeWorkflowAssets, renderFinalYouTubeVideo } from "../youtube-workflow.mjs";

const job = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: {
    mockMediaMode: true,
    flowOutputMode: "hybrid",
    hybridIntroVideoSceneCount: 2,
    scriptLengthPreset: "standard",
  },
});

const root = process.cwd();
const jobDir = mkdtempSync(join(tmpdir(), "hermes-youtube-hybrid-smoke-"));
const events = [];
const stages = createDefaultYouTubeStages({
  ffmpegBin: ffmpegPath,
  paths: { appRoot: root },
  mockMediaMode: true,
  emit: (event) => events.push(event),
});

const assets = await generateYouTubeWorkflowAssets(job, {
  ...stages,
  jobDir,
  ffmpegBin: ffmpegPath,
  paths: { appRoot: root },
  emit: (event) => events.push(event),
});

assert.ok(assets.draft.scenes.length >= 3, "hybrid smoke should produce multiple scenes");
assert.deepEqual(assets.draft.scenes.slice(0, 2).map((scene) => scene.outputMode), ["video", "video"]);
assert.ok(assets.draft.scenes.slice(2).every((scene) => scene.outputMode === "image"));
assert.ok(events.some((event) => JSON.stringify(event).includes("sceneOutputMode")), "progress should include per-scene output mode");

const result = await renderFinalYouTubeVideo(job, assets, {
  ffmpegBin: ffmpegPath,
  paths: { appRoot: root },
  renderScriptPath: join(root, "scripts/render-youtube-with-tts.mjs"),
  timeoutMs: 180000,
});

const manifest = JSON.parse(readFileSync(join(result.jobDir, "scene-render-manifest.json"), "utf8"));
assert.equal(manifest.ok, true);
assert.ok(result.finalPath, "hybrid mock should render final video");

console.log(JSON.stringify({ ok: true, finalPath: result.finalPath, sceneCount: assets.draft.scenes.length }));
```

- [ ] **Step 2: Run and verify failure or pass according to previous tasks**

Run:

```powershell
node scripts/smoke-electron-youtube-hybrid-mock-job.mjs
```

Expected after Tasks 1-6: PASS.

- [ ] **Step 3: Add package script**

In `package.json` scripts:

```json
"smoke:youtube-hybrid-mock": "node scripts/smoke-electron-youtube-hybrid-mock-job.mjs"
```

- [ ] **Step 4: Run smoke scripts**

Run:

```powershell
npm run smoke:youtube-mock
npm run smoke:youtube-hybrid-mock
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add scripts/smoke-electron-youtube-hybrid-mock-job.mjs package.json
git commit -m "test: add hybrid youtube smoke render"
```

### Task 8: Real Google Flow Validation and Packaging

**Files:**
- No source files unless tests reveal a defect.
- Generated artifacts under `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\...`
- Package output under `C:\Users\amd\hermes\dist-electron`

- [ ] **Step 1: Run focused checks**

Run:

```powershell
npm run check
npm run smoke:youtube-hybrid-mock
```

Expected: all pass.

- [ ] **Step 2: Run one real Hybrid job from Hermes Studio**

Use Hermes Studio with:

```text
Source type: Keyword
Source value: 구글 글래스
Length: 60 seconds
Google Flow mode: Hybrid
Opening video scenes: 2
Style: cinematic-tech-news
Upload: disabled
```

Expected artifacts:

```text
scene_1.mp4 -> Flow video normalized
scene_2.mp4 -> Flow video normalized
scene_3.mp4+ -> Flow image rendered as motion clips
scene-render-manifest.json
render-report-v2.json
final-youtube-*.mp4
```

- [ ] **Step 3: Inspect final output**

Run:

```powershell
node scripts/analyze-youtube-output.mjs "C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\<job-id>"
```

Expected:

```text
ok: true
no freeze failure
duration drift <= 0.5s
visual categories distributed
```

- [ ] **Step 4: Package**

Stop existing Studio processes:

```powershell
Get-Process | Where-Object { $_.ProcessName -eq 'Hermes YouTube Studio' } | Stop-Process -Force
```

Build:

```powershell
npm run electron:pack
node scripts/check-packaged-runtime-contract.mjs
node scripts/check-desktop-shortcut-launcher.mjs
```

Expected:

```text
C:\Users\amd\hermes\dist-electron\Hermes YouTube Studio Setup 1.0.0.exe
C:\Users\amd\hermes\dist-electron\win-unpacked\Hermes YouTube Studio.exe
```

- [ ] **Step 5: Commit final package-related source changes**

```powershell
git status --short
git add .
git commit -m "feat: add hybrid hook video and image workflow"
```

Do not commit generated `dist-electron` or large output folders if they are ignored by repository policy.

## QA Checklist

- Hybrid option appears in Studio.
- Hybrid count input appears only when Hybrid is selected.
- Job payload includes `flowOutputMode: "hybrid"` and `hybridIntroVideoSceneCount`.
- Draft scenes include `outputMode` per scene.
- First N scenes use Flow video prompts and Flow video generation.
- Remaining scenes use Flow image prompts and Nano Banana Pro image generation.
- All generated media becomes `scene_N.mp4`.
- Final render has no frozen middle section.
- Subtitle timing matches final video duration within 0.5s.
- `render-report-v2.json` and `scene-render-manifest.json` explain every scene.
- Desktop shortcut launches the newly packaged Studio.

## Execution Notes

- Keep Phase 1 transitions conservative: per-scene fade in/out plus concat. Avoid full `xfade` until all clips are consistently normalized and real jobs pass.
- If the first N Flow videos are shorter than narration and stretching would exceed the current duration policy, regenerate that specific scene or split narration. Do not freeze-frame the hook.
- For image scenes, prefer subtle motion. Too much zoom/pan will feel cheaper than a clean stable image.
- For direct-script mode, sentence order is the authority: first N sentences/scenes become video.
- For keyword/URL mode, HPSL scenes still become the authority after Gemini planning; first N planned scenes become video.
